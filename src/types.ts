export interface InventoryItem {
  id: string;
  janCode: string;
  productName: string;
  manufacturerName?: string;
  userName?: string;
  quantity: number;
  scannedAt: number;
}
