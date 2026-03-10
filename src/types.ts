export interface InventoryItem {
  id: string;
  janCode: string;
  productName: string;
  manufacturerName?: string;
  quantity: number;
  scannedAt: number;
}
