import { useState, useEffect } from 'react';
import { InventoryItem } from '../types';

const STORAGE_KEY = 'tanaoroshi_inventory';

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse inventory data from local storage", e);
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (item: Omit<InventoryItem, 'id' | 'scannedAt'>) => {
    const newItem: InventoryItem = {
      ...item,
      id: crypto.randomUUID(),
      scannedAt: Date.now(),
    };
    setItems((prev) => [newItem, ...prev]);
  };

  const updateQuantity = (id: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearAll = () => {
    setItems([]);
  };

  const exportCSV = () => {
    if (items.length === 0) return;
    
    // Header
    let csvContent = "JANコード,商品名,数量,スキャン日時\n";
    
    // Rows
    items.forEach((item) => {
      const date = new Date(item.scannedAt).toLocaleString('ja-JP');
      // Escape commas and quotes for CSV
      const safeName = `"${item.productName.replace(/"/g, '""')}"`;
      csvContent += `${item.janCode},${safeName},${item.quantity},${date}\n`;
    });

    // Create a Blob and trigger download (BOM付きでExcelの文字化けを防ぐ)
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `棚卸しデータ_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return { items, addItem, updateQuantity, removeItem, clearAll, exportCSV };
}
