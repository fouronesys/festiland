import { AsyncLocalStorage } from "node:async_hooks";
import type { Client, Transaction } from "@libsql/client";

export const transactionContext = new AsyncLocalStorage<boolean>();

/** One local process queues all access; async transactions must remain atomic. */
export function serializeLocalClient(raw: Client): Client {
  let tail = Promise.resolve();
  async function acquire() {
    const before = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await before;
    let released = false;
    return () => { if (!released) { released = true; release(); } };
  }
  const queryMethods = new Set(["execute", "batch", "migrate", "executeMultiple"]);
  return new Proxy(raw, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "transaction") return async (...args: unknown[]) => {
        const release = await acquire();
        try {
          const tx: Transaction = await value.apply(target, args);
          return new Proxy(tx, {
            get(transaction, key) {
              const method = Reflect.get(transaction, key, transaction);
              if (key === "commit" || key === "rollback") return async () => {
                try { return await method.call(transaction); } finally { release(); }
              };
              if (key === "close") return () => {
                try { return method.call(transaction); } finally { release(); }
              };
              return typeof method === "function" ? method.bind(transaction) : method;
            },
          });
        } catch (error) { release(); throw error; }
      };
      if (queryMethods.has(String(property))) return async (...args: unknown[]) => {
        if (transactionContext.getStore()) throw new Error("Use the transaction's tx object, not the global database, inside a transaction.");
        const release = await acquire();
        try { return await value.apply(target, args); } finally { release(); }
      };
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
