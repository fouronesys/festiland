import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, like as ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CancelOrderBody, CancelOrderParams, CancelOrderResponse,
  ConvertOrderBody, ConvertOrderParams, ConvertOrderResponse,
  CreateOrderBody, CreateOrderResponse, ListOrdersQueryParams, ListOrdersResponse,
  MarkOrderReadyParams, MarkOrderReadyResponse,
  UpdateOrderScheduleBody, UpdateOrderScheduleParams, UpdateOrderScheduleResponse,
} from "@workspace/api-zod";
import {
  accountsTable, auditLogTable, contactsTable, db, inventoryAdjustmentsTable,
  orderLinesTable, orderPaymentsTable, ordersTable, productsTable, saleLinesTable,
  salePaymentsTable, salesTable, taxRatesTable,
} from "@workspace/db";
import { getMember, requireRole } from "../middlewares/festilandAuth";
import { AppError } from "../lib/appError";
import { ensureSystemAccounts, postJournalEntry, systemAccountId, type DbTx } from "../lib/accounting";
import { calculateSaleLine } from "../lib/saleMath";
import { localAccountingDate } from "../lib/accounting-periods";

const router: IRouter = Router();
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidPickupTime(value: string | null | undefined) {
  return value == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isPickupTimeFuture(date: string, time: string | null | undefined, today: string) {
  if (date !== today || !time) return true;
  const currentTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santo_Domingo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  return time > currentTime;
}

function orderResponse(
  order: typeof ordersTable.$inferSelect,
  lines: (typeof orderLinesTable.$inferSelect)[],
  deposits: (typeof orderPaymentsTable.$inferSelect)[],
) {
  const open = order.status === "pending" || order.status === "ready";
  return {
    ...order,
    depositAmount: roundMoney(order.depositAmount),
    balanceDue: open ? roundMoney(order.total - order.depositAmount) : 0,
    items: lines.map(line => ({
      productId: line.productId,
      name: line.name,
      productType: line.productType,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      taxAmount: line.taxAmount,
    })),
    depositPayments: deposits.map(payment => ({
      method: payment.method,
      amount: roundMoney(payment.amount),
      createdAt: payment.createdAt,
    })),
  };
}

async function orderDetails(tx: DbTx, order: typeof ordersTable.$inferSelect) {
  const [lines, deposits] = await Promise.all([
    tx.select().from(orderLinesTable)
      .where(eq(orderLinesTable.orderId, order.id))
      .orderBy(asc(orderLinesTable.lineNumber)),
    tx.select().from(orderPaymentsTable)
      .where(eq(orderPaymentsTable.orderId, order.id))
      .orderBy(asc(orderPaymentsTable.createdAt)),
  ]);
  return orderResponse(order, lines, deposits);
}

router.get(
  "/orders",
  requireRole("owner", "manager", "cashier", "accountant"),
  async (req, res): Promise<void> => {
    const query = ListOrdersQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const conditions = [];
    if (query.data.status) conditions.push(eq(ordersTable.status, query.data.status));
    const search = query.data.search?.trim();
    if (search) {
      conditions.push(or(
        ilike(ordersTable.orderNumber, `%${search}%`),
        ilike(ordersTable.customerName, `%${search}%`),
      ));
    }
    const orders = await db.select().from(ordersTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(ordersTable.pickupDate), asc(ordersTable.pickupTime), desc(ordersTable.createdAt))
      .limit(1000);
    if (!orders.length) {
      res.json(ListOrdersResponse.parse([]));
      return;
    }
    const ids = orders.map(order => order.id);
    const [lines, deposits] = await Promise.all([
      db.select().from(orderLinesTable).where(inArray(orderLinesTable.orderId, ids))
        .orderBy(asc(orderLinesTable.lineNumber)),
      db.select().from(orderPaymentsTable).where(inArray(orderPaymentsTable.orderId, ids))
        .orderBy(asc(orderPaymentsTable.createdAt)),
    ]);
    const linesByOrder = new Map<string, (typeof lines)>();
    const depositsByOrder = new Map<string, (typeof deposits)>();
    for (const line of lines) linesByOrder.set(line.orderId, [...(linesByOrder.get(line.orderId) ?? []), line]);
    for (const deposit of deposits) depositsByOrder.set(deposit.orderId, [...(depositsByOrder.get(deposit.orderId) ?? []), deposit]);
    res.json(ListOrdersResponse.parse(orders.map(order =>
      orderResponse(order, linesByOrder.get(order.id) ?? [], depositsByOrder.get(order.id) ?? []),
    )));
  },
);

router.post(
  "/orders",
  requireRole("owner", "manager", "cashier"),
  async (req, res): Promise<void> => {
    const parsed = CreateOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const today = localAccountingDate();
    const pickupDate = parsed.data.pickupDate.toISOString().slice(0, 10);
    if (!validCalendarDate(pickupDate) || pickupDate < today) {
      res.status(400).json({ error: "La fecha de recogida debe ser hoy o una fecha futura válida." });
      return;
    }
    if (!isValidPickupTime(parsed.data.pickupTime)) {
      res.status(400).json({ error: "La hora de recogida no es válida." });
      return;
    }
    if (!isPickupTimeFuture(pickupDate, parsed.data.pickupTime, today)) {
      res.status(400).json({ error: "La hora de recogida debe ser posterior a la hora actual de República Dominicana." });
      return;
    }
    if (new Set(parsed.data.items.map(item => item.productId)).size !== parsed.data.items.length) {
      res.status(400).json({ error: "Agrega cada producto una sola vez y ajusta su cantidad." });
      return;
    }

    const member = getMember(res);
    const result = await db.transaction(async tx => {
      const productRows = await Promise.all(
        [...parsed.data.items].sort((a, b) => a.productId.localeCompare(b.productId)).map(async item => {
          const [product] = await tx.select().from(productsTable)
            .where(eq(productsTable.id, item.productId)).limit(1);
          return product ? { item, product } : null;
        }),
      );
      if (productRows.some(row => !row)) return { error: "Uno de los artículos ya no está en el catálogo." as const };
      const rows = productRows as { item: typeof parsed.data.items[number]; product: typeof productsTable.$inferSelect }[];
      for (const { item, product } of rows) {
        if (!product.active) return { error: `${product.name} está desactivado.` as const };
        if (product.productType !== "service" && item.quantity > product.stock - product.reservedStock) {
          return {
            error: `Existencia insuficiente para ${product.name}. Disponible sin reservar: ${Math.max(0, product.stock - product.reservedStock)}.` as const,
          };
        }
      }

      const customerId = parsed.data.customerId ?? null;
      let customerName: string | null = null;
      if (customerId) {
        const [customer] = await tx.select({ name: contactsTable.name }).from(contactsTable)
          .where(and(eq(contactsTable.id, customerId), eq(contactsTable.kind, "customer"))).limit(1);
        customerName = customer?.name ?? null;
        if (!customerName) return { error: "Selecciona un cliente válido." as const };
      }

      const subtotal = roundMoney(rows.reduce((sum, row) => sum + row.product.price * row.item.quantity, 0));
      const discountAmount = roundMoney(parsed.data.discountAmount);
      if (discountAmount > subtotal) return { error: "El descuento no puede superar el subtotal." as const };
      const taxableLines = await Promise.all(rows.map(async row => {
        const [rate] = row.product.taxRateId
          ? await tx.select().from(taxRatesTable).where(and(
              eq(taxRatesTable.id, row.product.taxRateId),
              eq(taxRatesTable.active, true),
            )).limit(1)
          : [];
        return { ...row, rate };
      }));
      const computedLines = taxableLines.map(({ item, product, rate }) => ({
        item,
        product,
        ...calculateSaleLine({
          price: product.price,
          quantity: item.quantity,
          subtotal,
          discount: discountAmount,
          rate: rate?.rate,
          inclusive: rate?.inclusive,
        }),
      }));
      const taxAmount = roundMoney(computedLines.reduce((sum, line) => sum + line.taxAmount, 0));
      const total = roundMoney(computedLines.reduce((sum, line) => sum + line.lineTotal, 0));
      const depositAmount = roundMoney(parsed.data.payments.reduce((sum, payment) => sum + payment.amount, 0));
      if (total <= 0) return { error: "El total del pedido debe ser mayor que cero." as const };
      if (depositAmount > total) return { error: "El anticipo no puede superar el total del pedido." as const };
      if (depositAmount > 0 && !customerId) {
        return { error: "Selecciona un cliente para registrar un anticipo." as const };
      }

      const orderId = randomUUID();
      const orderNumber = `PED-${today.replaceAll("-", "")}-${orderId.slice(0, 6).toUpperCase()}`;
      const [order] = await tx.insert(ordersTable).values({
        id: orderId,
        orderNumber,
        customerId,
        customerName,
        pickupDate,
        pickupTime: parsed.data.pickupTime ?? null,
        status: "pending",
        subtotal,
        discountAmount,
        taxAmount,
        total,
        depositAmount,
        note: parsed.data.note?.trim() || null,
        createdBy: member.id,
      }).returning();
      await tx.insert(orderLinesTable).values(computedLines.map((line, lineNumber) => ({
        orderId,
        lineNumber,
        productId: line.product.id,
        name: line.product.name,
        productType: line.product.productType,
        quantity: line.item.quantity,
        unitPrice: line.product.price,
        unitCost: line.product.cost,
        lineTotal: line.lineTotal,
        taxAmount: line.taxAmount,
      })));
      if (parsed.data.payments.length) {
        await tx.insert(orderPaymentsTable).values(parsed.data.payments.map(payment => ({
          orderId,
          method: payment.method,
          amount: roundMoney(payment.amount),
          createdBy: member.id,
        })));
      }

      for (const line of computedLines) {
        if (line.product.productType === "service") continue;
        const [reserved] = await tx.update(productsTable)
          .set({
            reservedStock: sql`${productsTable.reservedStock} + ${line.item.quantity}`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(productsTable.id, line.product.id),
            sql`${productsTable.stock} - ${productsTable.reservedStock} >= ${line.item.quantity}`,
          ))
          .returning({ id: productsTable.id });
        if (!reserved) throw new AppError(409, `La disponibilidad de ${line.product.name} cambió. Vuelve a revisar el pedido.`);
      }

      if (depositAmount > 0) {
        await ensureSystemAccounts(tx);
        const cashAmount = roundMoney(parsed.data.payments
          .filter(payment => payment.method === "cash")
          .reduce((sum, payment) => sum + payment.amount, 0));
        const bankAmount = roundMoney(parsed.data.payments
          .filter(payment => payment.method === "card" || payment.method === "transfer")
          .reduce((sum, payment) => sum + payment.amount, 0));
        const lines = [
          ...(cashAmount ? [{ accountId: await systemAccountId(tx, "cash"), debit: cashAmount, credit: 0 }] : []),
          ...(bankAmount ? [{ accountId: await systemAccountId(tx, "bank"), debit: bankAmount, credit: 0 }] : []),
          { accountId: await systemAccountId(tx, "customerAdvances"), debit: 0, credit: depositAmount },
        ];
        await postJournalEntry(tx, {
          date: today,
          description: `Anticipo de pedido ${orderNumber}`,
          source: "order_deposit",
          sourceId: orderId,
          createdBy: member.id,
          lines,
        });
      }
      await tx.insert(auditLogTable).values({
        actorId: member.id,
        action: "create",
        entity: "order",
        entityId: orderId,
        details: `${orderNumber} · recogida ${pickupDate} · ${total.toFixed(2)} DOP`,
      });
      return { order: await orderDetails(tx, order) };
    });
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(CreateOrderResponse.parse(result.order));
  },
);

router.patch(
  "/orders/:orderId",
  requireRole("owner", "manager", "cashier"),
  async (req, res): Promise<void> => {
    const params = UpdateOrderScheduleParams.safeParse(req.params);
    const parsed = UpdateOrderScheduleBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!Object.keys(parsed.data).length) {
      res.status(400).json({ error: "Indica una fecha, hora o nota para actualizar." });
      return;
    }
    const today = localAccountingDate();
    const pickupDate = parsed.data.pickupDate?.toISOString().slice(0, 10);
    if (pickupDate && !validCalendarDate(pickupDate)) {
      res.status(400).json({ error: "La fecha de recogida no es válida." });
      return;
    }
    if (!isValidPickupTime(parsed.data.pickupTime)) {
      res.status(400).json({ error: "La hora de recogida no es válida." });
      return;
    }
    const member = getMember(res);
    const result = await db.transaction(async tx => {
      const [current] = await tx.select().from(ordersTable).where(eq(ordersTable.id, params.data.orderId)).limit(1);
      if (!current) return { error: "No encontramos ese pedido." as const };
      if (current.status !== "pending" && current.status !== "ready") {
        return { error: "Solo puedes reprogramar pedidos pendientes o listos para recoger." as const };
      }
      const effectivePickupDate = pickupDate ?? current.pickupDate;
      const effectivePickupTime = parsed.data.pickupTime !== undefined ? parsed.data.pickupTime : current.pickupTime;
      if (!validCalendarDate(effectivePickupDate) || effectivePickupDate < today) {
        return { error: "La fecha de recogida debe ser hoy o una fecha futura válida." as const };
      }
      if (!isPickupTimeFuture(effectivePickupDate, effectivePickupTime, today)) {
        return { error: "La hora de recogida debe ser posterior a la hora actual de República Dominicana." as const };
      }
      const [updated] = await tx.update(ordersTable).set({
        ...(pickupDate !== undefined ? { pickupDate } : {}),
        ...(parsed.data.pickupTime !== undefined ? { pickupTime: parsed.data.pickupTime } : {}),
        ...(parsed.data.note !== undefined ? { note: parsed.data.note?.trim() || null } : {}),
        updatedAt: new Date(),
      }).where(eq(ordersTable.id, current.id)).returning();
      await tx.insert(auditLogTable).values({
        actorId: member.id, action: "update", entity: "order", entityId: current.id,
        details: `Pedido ${current.orderNumber} reprogramado para ${updated.pickupDate}${updated.pickupTime ? ` ${updated.pickupTime}` : ""}`,
      });
      return { order: await orderDetails(tx, updated) };
    });
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(UpdateOrderScheduleResponse.parse(result.order));
  },
);

router.post(
  "/orders/:orderId/ready",
  requireRole("owner", "manager", "cashier"),
  async (req, res): Promise<void> => {
    const params = MarkOrderReadyParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const member = getMember(res);
    const result = await db.transaction(async tx => {
      const [current] = await tx.select().from(ordersTable).where(eq(ordersTable.id, params.data.orderId)).limit(1);
      if (!current) return { error: "No encontramos ese pedido." as const };
      if (current.status === "ready") return { order: await orderDetails(tx, current) };
      if (current.status !== "pending") return { error: "Este pedido no se puede marcar como listo." as const };
      const [updated] = await tx.update(ordersTable).set({ status: "ready", updatedAt: new Date() })
        .where(eq(ordersTable.id, current.id)).returning();
      await tx.insert(auditLogTable).values({
        actorId: member.id, action: "update", entity: "order", entityId: current.id,
        details: `Pedido ${current.orderNumber} listo para recoger`,
      });
      return { order: await orderDetails(tx, updated) };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json(MarkOrderReadyResponse.parse(result.order));
  },
);

router.post(
  "/orders/:orderId/cancel",
  requireRole("owner", "manager"),
  async (req, res): Promise<void> => {
    const params = CancelOrderParams.safeParse(req.params);
    const parsed = CancelOrderBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success || parsed.data.confirmDepositRefund !== true) {
      res.status(400).json({ error: "Confirma que devolviste el anticipo por los mismos medios de pago para cancelar el pedido." });
      return;
    }
    const member = getMember(res);
    const today = localAccountingDate();
    const result = await db.transaction(async tx => {
      const [current] = await tx.select().from(ordersTable).where(eq(ordersTable.id, params.data.orderId)).limit(1);
      if (!current) return { error: "No encontramos ese pedido." as const };
      if (current.status !== "pending" && current.status !== "ready") {
        return { error: "Solo puedes cancelar pedidos pendientes o listos para recoger." as const };
      }
      const lines = await tx.select().from(orderLinesTable).where(eq(orderLinesTable.orderId, current.id));
      for (const line of lines) {
        if (line.productType === "service") continue;
        const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, line.productId)).limit(1);
        if (!product || product.reservedStock < line.quantity) {
          throw new AppError(409, `No se pudo liberar la reserva de ${line.name}. Revisa el inventario antes de cancelar.`);
        }
        const [released] = await tx.update(productsTable)
          .set({ reservedStock: product.reservedStock - line.quantity, updatedAt: new Date() })
          .where(and(eq(productsTable.id, product.id), sql`${productsTable.reservedStock} >= ${line.quantity}`))
          .returning({ id: productsTable.id });
        if (!released) throw new AppError(409, `La reserva de ${line.name} cambió. Vuelve a intentar.`);
      }

      const deposits = await tx.select().from(orderPaymentsTable).where(eq(orderPaymentsTable.orderId, current.id));
      const depositTotal = roundMoney(deposits.reduce((sum, payment) => sum + payment.amount, 0));
      if (Math.abs(depositTotal - current.depositAmount) > 0.01) {
        throw new AppError(409, "Los anticipos del pedido no cuadran. No se canceló ni se liberó el pedido.");
      }
      if (depositTotal > 0) {
        await ensureSystemAccounts(tx);
        const cashRefund = roundMoney(deposits.filter(payment => payment.method === "cash")
          .reduce((sum, payment) => sum + payment.amount, 0));
        const bankRefund = roundMoney(deposits.filter(payment => payment.method === "card" || payment.method === "transfer")
          .reduce((sum, payment) => sum + payment.amount, 0));
        await postJournalEntry(tx, {
          date: today,
          description: `Devolución de anticipo · pedido ${current.orderNumber}`,
          source: "order_deposit_refund",
          sourceId: current.id,
          createdBy: member.id,
          lines: [
            { accountId: await systemAccountId(tx, "customerAdvances"), debit: depositTotal, credit: 0 },
            ...(cashRefund ? [{ accountId: await systemAccountId(tx, "cash"), debit: 0, credit: cashRefund }] : []),
            ...(bankRefund ? [{ accountId: await systemAccountId(tx, "bank"), debit: 0, credit: bankRefund }] : []),
          ],
        });
      }
      const [updated] = await tx.update(ordersTable).set({
        status: "cancelled",
        depositRefunded: depositTotal > 0,
        updatedAt: new Date(),
      }).where(eq(ordersTable.id, current.id)).returning();
      await tx.insert(auditLogTable).values({
        actorId: member.id, action: "cancel", entity: "order", entityId: current.id,
        details: `Pedido ${current.orderNumber} cancelado; reserva liberada${depositTotal ? ` y anticipo de ${depositTotal.toFixed(2)} DOP devuelto` : ""}`,
      });
      return { order: await orderDetails(tx, updated) };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json(CancelOrderResponse.parse(result.order));
  },
);

router.post(
  "/orders/:orderId/convert",
  requireRole("owner", "manager", "cashier"),
  async (req, res): Promise<void> => {
    const params = ConvertOrderParams.safeParse(req.params);
    const parsed = ConvertOrderBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const member = getMember(res);
    const today = localAccountingDate();
    const result = await db.transaction(async tx => {
      const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, params.data.orderId)).limit(1);
      if (!order) return { error: "No encontramos ese pedido." as const };
      if (order.status !== "pending" && order.status !== "ready") {
        return { error: "Este pedido ya se convirtió en venta o fue cancelado." as const };
      }
      const [items, deposits] = await Promise.all([
        tx.select().from(orderLinesTable).where(eq(orderLinesTable.orderId, order.id))
          .orderBy(asc(orderLinesTable.lineNumber)),
        tx.select().from(orderPaymentsTable).where(eq(orderPaymentsTable.orderId, order.id)),
      ]);
      if (!items.length) throw new AppError(409, "El pedido no tiene artículos.");
      const depositTotal = roundMoney(deposits.reduce((sum, payment) => sum + payment.amount, 0));
      if (Math.abs(depositTotal - order.depositAmount) > 0.01) {
        throw new AppError(409, "Los anticipos del pedido no cuadran. No se convirtió en venta.");
      }
      const balanceDue = roundMoney(order.total - depositTotal);
      const paymentTotal = roundMoney(parsed.data.payments.reduce((sum, payment) => sum + payment.amount, 0));
      if (Math.round(paymentTotal * 100) !== Math.round(balanceDue * 100)) {
        return { error: `Los pagos al convertir deben sumar el saldo pendiente de ${balanceDue.toFixed(2)} DOP.` as const };
      }
      if (parsed.data.payments.some(payment => payment.method === "credit") && !order.customerId) {
        return { error: "Selecciona un cliente para dejar un saldo a crédito." as const };
      }

      const productMap = new Map<string, typeof productsTable.$inferSelect>();
      for (const line of items.filter(line => line.productType !== "service")) {
        if (!productMap.has(line.productId)) {
          const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, line.productId)).limit(1);
          if (!product) throw new AppError(409, `${line.name} ya no existe en el inventario.`);
          productMap.set(line.productId, product);
        }
        const product = productMap.get(line.productId)!;
        if (product.stock < line.quantity || product.reservedStock < line.quantity) {
          throw new AppError(409, `La reserva de ${line.name} no coincide con la existencia física. No se convirtió el pedido.`);
        }
      }

      const saleId = randomUUID();
      const receiptNumber = `FL-${today.replaceAll("-", "")}-${saleId.slice(0, 6).toUpperCase()}`;
      const salePayments = [
        ...(depositTotal > 0 ? [{ method: "advance", amount: depositTotal }] : []),
        ...parsed.data.payments.map(payment => ({ method: payment.method, amount: roundMoney(payment.amount) })),
      ];
      const [sale] = await tx.insert(salesTable).values({
        id: saleId,
        receiptNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        status: "completed",
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        taxAmount: order.taxAmount,
        total: order.total,
        paymentSummary: salePayments.map(payment => `${payment.method}:${payment.amount.toFixed(2)}`).join(" · "),
        note: order.note,
        createdBy: member.id,
      }).returning();
      for (const line of items) {
        await tx.insert(saleLinesTable).values({
          saleId: sale.id,
          productId: line.productId,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
          taxAmount: line.taxAmount,
        });
        if (line.productType === "service") continue;
        const product = productMap.get(line.productId)!;
        const [updated] = await tx.update(productsTable).set({
          stock: product.stock - line.quantity,
          reservedStock: product.reservedStock - line.quantity,
          updatedAt: new Date(),
        }).where(and(
          eq(productsTable.id, product.id),
          sql`${productsTable.stock} >= ${line.quantity}`,
          sql`${productsTable.reservedStock} >= ${line.quantity}`,
        )).returning({ id: productsTable.id });
        if (!updated) throw new AppError(409, `La reserva de ${line.name} cambió. No se convirtió el pedido.`);
        await tx.insert(inventoryAdjustmentsTable).values({
          productId: line.productId,
          quantityChange: -line.quantity,
          reason: "sale",
          note: `Venta ${receiptNumber} · ${order.orderNumber}`,
          createdBy: member.id,
        });
      }
      await tx.insert(salePaymentsTable).values(salePayments.map(payment => ({
        saleId: sale.id, method: payment.method, amount: payment.amount,
      })));

      await ensureSystemAccounts(tx);
      const cashTotal = roundMoney(parsed.data.payments.filter(payment => payment.method === "cash")
        .reduce((sum, payment) => sum + payment.amount, 0));
      const bankTotal = roundMoney(parsed.data.payments.filter(payment => payment.method === "card" || payment.method === "transfer")
        .reduce((sum, payment) => sum + payment.amount, 0));
      const creditTotal = roundMoney(parsed.data.payments.filter(payment => payment.method === "credit")
        .reduce((sum, payment) => sum + payment.amount, 0));
      const journalLines = [
        ...(cashTotal ? [{ accountId: await systemAccountId(tx, "cash"), debit: cashTotal, credit: 0 }] : []),
        ...(bankTotal ? [{ accountId: await systemAccountId(tx, "bank"), debit: bankTotal, credit: 0 }] : []),
        ...(creditTotal ? [{ accountId: await systemAccountId(tx, "receivable"), debit: creditTotal, credit: 0 }] : []),
        ...(depositTotal ? [{ accountId: await systemAccountId(tx, "customerAdvances"), debit: depositTotal, credit: 0 }] : []),
        { accountId: await systemAccountId(tx, "revenue"), debit: 0, credit: roundMoney(order.total - order.taxAmount) },
        ...(order.taxAmount ? [{ accountId: await systemAccountId(tx, "tax"), debit: 0, credit: order.taxAmount }] : []),
      ];
      const costOfGoods = roundMoney(items.filter(line => line.productType !== "service")
        .reduce((sum, line) => sum + line.unitCost * line.quantity, 0));
      if (costOfGoods > 0) {
        journalLines.push(
          { accountId: await systemAccountId(tx, "cogs"), debit: costOfGoods, credit: 0 },
          { accountId: await systemAccountId(tx, "inventory"), debit: 0, credit: costOfGoods },
        );
      }
      await postJournalEntry(tx, {
        date: today,
        description: `Venta ${receiptNumber} · pedido ${order.orderNumber}`,
        source: "sale",
        sourceId: sale.id,
        createdBy: member.id,
        lines: journalLines,
      });
      const [convertedOrder] = await tx.update(ordersTable).set({
        status: "converted", saleId: sale.id, updatedAt: new Date(),
      }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, order.status))).returning();
      if (!convertedOrder) throw new AppError(409, "El pedido cambió en otra sesión y no pudo convertirse.");
      await tx.insert(auditLogTable).values({
        actorId: member.id, action: "convert", entity: "order", entityId: order.id,
        details: `Pedido ${order.orderNumber} convertido en venta ${receiptNumber}`,
      });
      return {
        sale: {
          ...sale,
          items: items.map(line => ({
            productId: line.productId,
            name: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            taxAmount: line.taxAmount,
          })),
        },
      };
    });
    if ("error" in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.status(201).json(ConvertOrderResponse.parse(result.sale));
  },
);

export default router;
