import { useState } from 'react'
import { useInventory } from './hooks/useInventory'
import { Scanner } from './components/Scanner'
import { Camera, List as ListIcon, Settings, Download, Trash2 } from 'lucide-react'
import './index.css'

function App() {
  const { items, addItem, updateQuantity, removeItem, clearAll, exportCSV } = useInventory();
  const [activeTab, setActiveTab] = useState<'scan' | 'list' | 'settings'>('scan');
  
  // スキャン中の状態管理
  const [isScanning, setIsScanning] = useState(false);
  const [scannedJan, setScannedJan] = useState<string | null>(null);
  const [quantityInput, setQuantityInput] = useState<string>("1");
  const [productNameInput, setProductNameInput] = useState<string>("");

  const handleScan = (decodedText: string) => {
    // 連続スキャンを防ぐためスキャンを一時停止し、入力フォームを表示
    setIsScanning(false);
    setScannedJan(decodedText);
    setQuantityInput("1");
    setProductNameInput(""); // Phase 3のAPI自動取得前は手入力
  };

  const handleSaveScannedItem = () => {
    if (!scannedJan) return;
    
    addItem({
      janCode: scannedJan,
      productName: productNameInput || "名称未設定",
      quantity: parseInt(quantityInput, 10) || 1,
    });
    
    // リセットしてスキャン再開待ちへ
    setScannedJan(null);
    setQuantityInput("1");
    setProductNameInput("");
  };

  const handleCancelScan = () => {
    setScannedJan(null);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>棚卸しアプリ</h1>
      </header>
      
      <main className="app-main">
        {activeTab === 'scan' && (
          <div className="scan-section">
            {!scannedJan ? (
              <div className="scanner-container">
                {isScanning ? (
                  <>
                    <Scanner isActive={isScanning} onScan={handleScan} />
                    <button className="btn btn-secondary mt-4" onClick={() => setIsScanning(false)}>
                      スキャンを停止
                    </button>
                  </>
                ) : (
                  <div className="start-scan-wrapper">
                    <p>商品のバーコードを読み取ります</p>
                    <button className="btn btn-primary btn-large" onClick={() => setIsScanning(true)}>
                      <Camera className="icon" /> スキャン開始
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="input-form card">
                <h3>商品登録</h3>
                <div className="form-group">
                  <label>JANコード</label>
                  <input type="text" value={scannedJan} readOnly className="form-control readonly" />
                </div>
                <div className="form-group">
                  <label>商品名</label>
                  <input 
                    type="text" 
                    value={productNameInput} 
                    onChange={(e) => setProductNameInput(e.target.value)} 
                    placeholder="手入力できます"
                    className="form-control" 
                  />
                  <small>※API自動取得はPhase 3で実装</small>
                </div>
                <div className="form-group">
                  <label>数量</label>
                  <input 
                    type="number" 
                    min="1"
                    value={quantityInput} 
                    onChange={(e) => setQuantityInput(e.target.value)} 
                    className="form-control quantity-input" 
                  />
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={handleCancelScan}>キャンセル</button>
                  <button className="btn btn-primary" onClick={handleSaveScannedItem}>保存する</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'list' && (
          <div className="list-section">
            <div className="list-header">
              <h2>記録データ ({items.length}件)</h2>
              <button className="btn btn-outline" onClick={exportCSV} disabled={items.length === 0}>
                <Download className="icon-small" /> CSV出力
              </button>
            </div>
            
            {items.length === 0 ? (
              <p className="empty-state">データがありません</p>
            ) : (
              <ul className="inventory-list">
                {items.map(item => (
                  <li key={item.id} className="inventory-item card">
                    <div className="item-details">
                      <div className="item-jan">{item.janCode}</div>
                      <div className="item-name">{item.productName}</div>
                    </div>
                    <div className="item-actions">
                      <div className="item-quantity">
                        <span className="qty-label">数量:</span>
                        <input 
                          type="number" 
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.id, parseInt(e.target.value, 10) || 1)}
                          className="qty-edit-input"
                        />
                      </div>
                      <button className="btn-icon text-danger" onClick={() => removeItem(item.id)}>
                        <Trash2 className="icon-small" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-section card">
            <h2>設定</h2>
            <p>APIキーの設定などはPhase 3で実装します。</p>
            <hr />
            <div className="danger-zone">
              <h3>データクリア</h3>
              <p>保存されているすべてのデータを削除します。</p>
              <button className="btn btn-danger" onClick={() => {
                if (window.confirm("すべてのデータを削除してよろしいですか？この操作は元に戻せません。")) {
                  clearAll();
                }
              }}>
                全データ削除
              </button>
            </div>
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <button className={`nav-btn ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => setActiveTab('scan')}>
          <Camera />
          <span>スキャン</span>
        </button>
        <button className={`nav-btn ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>
          <ListIcon />
          <span>リスト</span>
        </button>
        <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <Settings />
          <span>設定</span>
        </button>
      </nav>
    </div>
  )
}

export default App
