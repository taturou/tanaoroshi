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

  const addOrUpdateItem = (item: Omit<InventoryItem, 'id' | 'scannedAt'>) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.janCode === item.janCode);
      if (existingIndex >= 0) {
        // 既存のものがある場合は、数量と商品名（手入力等で更新された場合）を上書きし、スキャン日時を更新する
        const updatedItems = [...prev];
        updatedItems[existingIndex] = {
          ...updatedItems[existingIndex],
          productName: item.productName,
          manufacturerName: item.manufacturerName,
          imageUrl: item.imageUrl,
          userName: item.userName,
          quantity: item.quantity,
          scannedAt: Date.now(),
        };
        // 更新したアイテムを一番上に持ってくる
        const [updatedItem] = updatedItems.splice(existingIndex, 1);
        return [updatedItem, ...updatedItems];
      } else {
        // 新規追加
        const newItem: InventoryItem = {
          ...item,
          id: crypto.randomUUID(),
          scannedAt: Date.now(),
        };
        return [newItem, ...prev];
      }
    });
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

  const exportCSV = (currentUserName: string = "") => {
    if (items.length === 0) return;
    
    // Header
    let csvContent = "JANコード,商品名,メーカー名,数量,スキャン日時,ユーザ名\n";
    
    // Rows
    items.forEach((item) => {
      const date = new Date(item.scannedAt).toLocaleString('ja-JP');
      // Escape commas and quotes for CSV
      const safeName = `"${item.productName.replace(/"/g, '""')}"`;
      const safeManufacturer = `"${(item.manufacturerName || '').replace(/"/g, '""')}"`;
      const safeUserName = `"${(item.userName || currentUserName).replace(/"/g, '""')}"`;
      csvContent += `${item.janCode},${safeName},${safeManufacturer},${item.quantity},${date},${safeUserName}\n`;
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

  const importCSV = (csvText: string, mode: 'replace' | 'merge') => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return; // Header only or empty
    
    // CSV parser (handles quoted commas)
    const parseCSVLine = (line: string) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++; 
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    };

    const newItems: InventoryItem[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      if (parts.length >= 4) {
        const timestamp = parts[4] ? new Date(parts[4]).getTime() : Date.now();
        newItems.push({
          id: crypto.randomUUID(),
          janCode: parts[0],
          productName: parts[1] || "名称未設定",
          manufacturerName: parts[2] || "",
          quantity: parseInt(parts[3], 10) || 1,
          scannedAt: isNaN(timestamp) ? Date.now() : timestamp,
          userName: parts[5] || "",
        });
      }
    }

    if (mode === 'replace') {
      setItems(newItems.reverse()); // Keep newest first
    } else {
      setItems((prev) => {
        const merged = [...prev];
        newItems.forEach(newItem => {
          const existingIndex = merged.findIndex(i => i.janCode === newItem.janCode);
          if (existingIndex >= 0) {
            merged[existingIndex] = {
              ...merged[existingIndex],
              quantity: merged[existingIndex].quantity + newItem.quantity,
              // Keep newer date or existing info
            };
            const [updated] = merged.splice(existingIndex, 1);
            merged.unshift(updated);
          } else {
            merged.unshift(newItem);
          }
        });
        return merged;
      });
    }
  };

  return { items, addItem, addOrUpdateItem, updateQuantity, removeItem, clearAll, exportCSV, importCSV };
}
