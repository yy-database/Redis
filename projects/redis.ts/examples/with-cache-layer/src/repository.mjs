const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Simulated product repository with an artificial read delay. */
export function createRepository({ delayMs = 25 } = {}) {
  const rows = new Map([
    ['SKU-1', { sku: 'SKU-1', name: 'Widget', price: 9.5 }],
    ['SKU-2', { sku: 'SKU-2', name: 'Gadget', price: 14.0 }],
    ['SKU-3', { sku: 'SKU-3', name: 'Gizmo', price: 21.0 }],
  ]);

  return {
    async loadProduct(sku) {
      await delay(delayMs);
      const row = rows.get(sku);
      return row ? { ...row } : null;
    },
    updateProduct(sku, patch) {
      const row = rows.get(sku);
      if (!row) return null;
      Object.assign(row, patch);
      return { ...row };
    },
  };
}
