import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateProduct, useUpdateProduct, getListProductsQueryKey,
  useCreateTaxRate, useUpdateTaxRate, getListTaxRatesQueryKey, getListAuditLogQueryKey,
  type Product, type TaxRate,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Modal, fieldClass, labelClass } from '@/components/states';

type ProductForm = { name: string; sku: string; barcode: string; category: string; price: string; cost: string; stock: string; minStock: string; unit: string; productType: 'product' | 'service'; taxRateId: string; active: boolean };

export function ProductEditor({ product, taxRates, onClose }: { product?: Product | null; taxRates: TaxRate[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const isEdit = !!product;
  const form = useForm<ProductForm>({ defaultValues: {
    name: product?.name || '', sku: product?.sku || '', barcode: product?.barcode || '', category: product?.category || '',
    price: product ? String(product.price) : '', cost: product ? String(product.cost) : '', stock: product ? String(product.stock) : '0',
    minStock: product ? String(product.minStock) : '0', unit: product?.unit || 'unidad', productType: product?.productType || 'product',
    taxRateId: product?.taxRateId || '', active: product?.active ?? true,
  } });
  const errors = form.formState.errors;
  const pending = create.isPending || update.isPending;

  const submit = form.handleSubmit(async v => {
    const nums = { price: Number(v.price), cost: Number(v.cost), stock: Number(v.stock), minStock: Number(v.minStock) };
    let bad = false;
    if (!v.name.trim()) { form.setError('name', { message: 'Obligatorio.' }); bad = true; }
    if (!v.category.trim()) { form.setError('category', { message: 'Obligatorio.' }); bad = true; }
    (['price', 'cost', 'stock', 'minStock'] as const).forEach(k => { if (v[k] === '' || !(nums[k] >= 0)) { form.setError(k, { message: 'Número mayor o igual a 0.' }); bad = true; } });
    if (bad) return;
    const common = { name: v.name.trim(), sku: v.sku.trim() || null, barcode: v.barcode.trim() || null, category: v.category.trim(), price: nums.price, cost: nums.cost, minStock: nums.minStock, unit: v.unit.trim() || 'unidad', productType: v.productType, taxRateId: v.taxRateId || null };
    try {
      if (isEdit) await update.mutateAsync({ productId: product!.id, data: { ...common, active: v.active } });
      else await create.mutateAsync({ data: { ...common, stock: nums.stock } });
      await Promise.all([getListProductsQueryKey(), getListAuditLogQueryKey()].map(queryKey => qc.invalidateQueries({ queryKey })));
      toast({ title: isEdit ? 'Producto actualizado' : 'Producto creado' });
      onClose();
    } catch { toast({ title: 'No se pudo guardar', description: 'Revisa los datos o si el código ya existe.', variant: 'destructive' }); }
  });

  const err = (k: keyof ProductForm) => errors[k] && <span role="alert" className="text-xs text-[#bd4778]">{String(errors[k]?.message)}</span>;
  return <Modal title={isEdit ? 'Editar producto' : 'Agregar producto'} eyebrow="Catálogo" onClose={onClose}>
    <Form {...form}><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className={`${labelClass} sm:col-span-2`}>Nombre *<Input {...form.register('name')} className="h-11" data-testid="input-product-name"/>{err('name')}</label>
      <label className={labelClass}>SKU<Input {...form.register('sku')} className="h-11" data-testid="input-product-sku"/></label>
      <label className={labelClass}>Código de barras<Input {...form.register('barcode')} className="h-11" placeholder="Escanéalo aquí" data-testid="input-product-barcode"/></label>
      <label className={labelClass}>Categoría *<Input {...form.register('category')} className="h-11" data-testid="input-product-category"/>{err('category')}</label>
      <label className={labelClass}>Tipo<select {...form.register('productType')} className={fieldClass} data-testid="select-product-type"><option value="product">Producto</option><option value="service">Servicio</option></select></label>
      <label className={labelClass}>Precio de venta (DOP) *<Input type="number" step="0.01" min="0" {...form.register('price')} className="h-11" data-testid="input-product-price"/>{err('price')}</label>
      <label className={labelClass}>Costo (DOP) *<Input type="number" step="0.01" min="0" {...form.register('cost')} className="h-11" data-testid="input-product-cost"/>{err('cost')}</label>
      <label className={labelClass}>{isEdit ? 'Existencia actual' : 'Existencia inicial *'}<Input type="number" step="0.01" min="0" disabled={isEdit} {...form.register('stock')} className="h-11" data-testid="input-product-stock"/>{isEdit && <span className="text-xs font-normal text-[#83908e]">Se cambia desde Inventario o Compras.</span>}{err('stock')}</label>
      <label className={labelClass}>Avisar al llegar a *<Input type="number" step="0.01" min="0" {...form.register('minStock')} className="h-11" data-testid="input-product-minstock"/>{err('minStock')}</label>
      <label className={labelClass}>Unidad<Input {...form.register('unit')} className="h-11" data-testid="input-product-unit"/></label>
      <label className={labelClass}>Impuesto<select {...form.register('taxRateId')} className={fieldClass} data-testid="select-product-tax"><option value="">Sin impuesto</option>{taxRates.map(t => <option key={t.id} value={t.id}>{t.name} · {t.rate}% {t.inclusive ? '(incluido)' : '(adicional)'}{t.active ? '' : ' · inactiva'}</option>)}</select></label>
      {isEdit && <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" {...form.register('active')} className="h-4 w-4 accent-[#bd4778]" data-testid="checkbox-product-active"/>Disponible para la venta</label>}
      <div className="mt-2 flex gap-3 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose} className="h-12 flex-1" data-testid="button-cancel-product">Cancelar</Button><Button disabled={pending} className="h-12 flex-1 bg-[#bd4778] font-bold hover:bg-[#a83968]" data-testid="button-save-product">{pending ? 'Guardando…' : 'Guardar'}</Button></div>
    </form></Form>
  </Modal>;
}

type TaxForm = { name: string; rate: string; inclusive: 'yes' | 'no'; active: boolean };

export function TaxEditor({ tax, onClose }: { tax?: TaxRate | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateTaxRate();
  const update = useUpdateTaxRate();
  const isEdit = !!tax;
  const form = useForm<TaxForm>({ defaultValues: { name: tax?.name || '', rate: tax ? String(tax.rate) : '', inclusive: tax?.inclusive ? 'yes' : 'no', active: tax?.active ?? false } });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async v => {
    const rate = Number(v.rate);
    if (!v.name.trim()) { form.setError('name', { message: 'Obligatorio.' }); return; }
    if (v.rate === '' || !(rate >= 0 && rate <= 100)) { form.setError('rate', { message: 'Entre 0 y 100.' }); return; }
    const data = { name: v.name.trim(), rate, inclusive: v.inclusive === 'yes', active: v.active };
    try {
      if (isEdit) await update.mutateAsync({ taxRateId: tax!.id, data });
      else await create.mutateAsync({ data });
      await Promise.all([getListTaxRatesQueryKey(), getListProductsQueryKey(), getListAuditLogQueryKey()].map(queryKey => qc.invalidateQueries({ queryKey })));
      toast({ title: isEdit ? 'Tasa actualizada' : 'Tasa creada' });
      onClose();
    } catch { toast({ title: 'No se pudo guardar la tasa', variant: 'destructive' }); }
  });
  return <Modal title={isEdit ? 'Editar tasa' : 'Crear tasa'} eyebrow="Impuestos" onClose={onClose}>
    <Form {...form}><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className={`${labelClass} sm:col-span-2`}>Nombre *<Input {...form.register('name')} className="h-11" placeholder="Ej. ITBIS" data-testid="input-tax-name"/>{errors.name && <span role="alert" className="text-xs text-[#bd4778]">{errors.name.message}</span>}</label>
      <label className={labelClass}>Porcentaje *<Input type="number" step="0.01" min="0" max="100" {...form.register('rate')} className="h-11" data-testid="input-tax-rate"/>{errors.rate && <span role="alert" className="text-xs text-[#bd4778]">{errors.rate.message}</span>}</label>
      <label className={labelClass}>Modalidad<select {...form.register('inclusive')} className={fieldClass} data-testid="select-tax-inclusive"><option value="no">Se suma al precio</option><option value="yes">Incluido en el precio</option></select></label>
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" {...form.register('active')} className="h-4 w-4 accent-[#bd4778]" data-testid="checkbox-tax-active"/>Activa (se aplica en ventas de productos asignados)</label>
      <p className="text-xs text-[#83908e] sm:col-span-2">Confirma con tu asesor fiscal la tasa y modalidad correctas; el sistema no valida reglas de la DGII.</p>
      <div className="mt-2 flex gap-3 sm:col-span-2"><Button type="button" variant="outline" onClick={onClose} className="h-12 flex-1" data-testid="button-cancel-tax">Cancelar</Button><Button disabled={create.isPending || update.isPending} className="h-12 flex-1 bg-[#bd4778] font-bold" data-testid="button-save-tax">{create.isPending || update.isPending ? 'Guardando…' : 'Guardar'}</Button></div>
    </form></Form>
  </Modal>;
}
