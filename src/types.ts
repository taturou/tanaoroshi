export interface InventoryItem {
  id: string;
  janCode: string;
  productName: string;
  manufacturerName?: string;
  category?: string;
  imageUrl?: string;
  userName?: string;
  quantity: number;
  scannedAt: number;
}
