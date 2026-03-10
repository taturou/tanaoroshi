import { useState } from 'react'
import { useInventory } from './hooks/useInventory'
import { useSettings } from './hooks/useSettings'
import { Scanner } from './components/Scanner'
import { ReloadPrompt } from './components/ReloadPrompt'
import { Camera, List as ListIcon, Settings, Download, Trash2, Loader2 } from 'lucide-react'
import './index.css'

function App() {
  const { items, addOrUpdateItem, updateQuantity, removeItem, clearAll, exportCSV } = useInventory();
  const { clientId, setClientId } = useSettings();
  const [activeTab, setActiveTab] = useState<'scan' | 'list' | 'settings'>('scan');
  
  // スキャン中の状態管理
  const [isScanning, setIsScanning] = useState(false);
  const [scannedJan, setScannedJan] = useState<string | null>(null);
  const [quantityInput, setQuantityInput] = useState<number>(1);
  const [productNameInput, setProductNameInput] = useState<string>("");
  const [manufacturerInput, setManufacturerInput] = useState<string>("");
  const [isFetchingName, setIsFetchingName] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isExistingItem, setIsExistingItem] = useState<boolean>(false);

  const fetchProductInfo = async (janCode: string, retries = 2): Promise<{name: string, manufacturer: string} | null> => {
    if (!clientId) return null;
    
    setApiError(null);
    setIsFetchingName(true);

    const targetUrl = encodeURIComponent(`https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?appid=${clientId}&jan_code=${janCode}`);
    
    const proxies = [
      `https://corsproxy.io/?url=${targetUrl}`,
      `https://api.allorigins.win/get?url=${targetUrl}`
    ];

    for (let attempt = 0; attempt <= retries; attempt++) {
      for (const proxyUrl of proxies) {
        try {
          const response = await fetch(proxyUrl);
          
          if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
          }
          
          let data;
          if (proxyUrl.includes('allorigins')) {
            const proxyData = await response.json();
            if (!proxyData.contents) throw new Error("Invalid allorigins response");
            data = JSON.parse(proxyData.contents);
          } else {
            data = await response.json();
          }
          
          if (data.Error) {
             setApiError(`API Error: ${data.Error.Message}`);
             setIsFetchingName(false);
             return null;
          }

          if (data.hits && data.hits.length > 0) {
            setIsFetchingName(false);
            const item = data.hits[0];
            const manufacturer = item.brand?.name || "";
            return { name: item.name, manufacturer };
          } else {
            setApiError("商品がデータベースに見つかりませんでした。");
            setIsFetchingName(false);
            return null;
          }
        } catch (error: any) {
          console.error(`Attempt ${attempt + 1} with ${proxyUrl} failed:`, error);
          if (attempt === retries && proxyUrl === proxies[proxies.length - 1]) {
            setApiError(`通信エラー（複数回試行）: APIサーバーが混雑しています。手入力してください。`);
          }
        }
      }
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setIsFetchingName(false);
    return null;
  };

  const handleScan = async (decodedText: string) => {
    setIsScanning(false);
    setScannedJan(decodedText);
    setApiError(null);
    
    const existingItem = items.find(item => item.janCode === decodedText);
    
    if (existingItem) {
      setIsExistingItem(true);
      setProductNameInput(existingItem.productName);
      setManufacturerInput(existingItem.manufacturerName || "");
      setQuantityInput(existingItem.quantity + 1);
    } else {
      setIsExistingItem(false);
      setQuantityInput(1);
      setProductNameInput("");
      setManufacturerInput("");
      
      if (clientId) {
        const info = await fetchProductInfo(decodedText);
        if (info) {
          setProductNameInput(info.name);
          setManufacturerInput(info.manufacturer);
        }
      }
    }
  };

  const handleSaveScannedItem = () => {
    if (!scannedJan) return;
    
    addOrUpdateItem({
      janCode: scannedJan,
      productName: productNameInput || "名称未設定",
      manufacturerName: manufacturerInput,
      quantity: quantityInput,
    });
    
    setScannedJan(null);
    setQuantityInput(1);
    setProductNameInput("");
    setManufacturerInput("");
    setIsExistingItem(false);
  };

  const handleCancelScan = () => {
    setScannedJan(null);
    setIsExistingItem(false);
  };

  return (
    <div className="app-container">
      <ReloadPrompt />
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
                <h3>商品登録 {isExistingItem ? <span className="badge badge-info">リスト登録済</span> : <span className="badge badge-success">新規</span>}</h3>
                {isExistingItem && (
                  <div className="alert alert-info">
                    既存のリストから商品情報を復元しました。数量を +1 しています。
                  </div>
                )}
                <div className="form-group">
                  <label>JANコード</label>
                  <input type="text" value={scannedJan} readOnly className="form-control readonly" />
                </div>
                <div className="form-group">
                  <label>商品名</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="text" 
                      value={productNameInput} 
                      onChange={(e) => setProductNameInput(e.target.value)} 
                      placeholder="手入力できます"
                      className="form-control" 
                      disabled={isFetchingName}
                    />
                    {isFetchingName && <Loader2 className="spinner" style={{ position: 'absolute', right: '10px', top: '10px', color: 'var(--primary-color)' }} />}
                  </div>
                  {apiError && <small style={{ color: 'red', display: 'block', marginTop: '4px' }}>{apiError}</small>}
                  {!clientId && <small>※設定画面でAPIキーを登録すると自動取得できます</small>}
                </div>
                <div className="form-group">
                  <label>メーカー名 / ブランド</label>
                  <input 
                    type="text" 
                    value={manufacturerInput} 
                    onChange={(e) => setManufacturerInput(e.target.value)} 
                    placeholder="手入力できます"
                    className="form-control" 
                    disabled={isFetchingName}
                  />
                </div>
                <div className="form-group">
                  <label>数量</label>
                  <div className="quantity-control-group">
                    <button 
                      className="btn btn-qty" 
                      onClick={() => setQuantityInput(prev => Math.max(1, prev - 1))}
                    >
                      -
                    </button>
                    <div className="quantity-display">{quantityInput}</div>
                    <button 
                      className="btn btn-qty" 
                      onClick={() => setQuantityInput(prev => prev + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={handleCancelScan}>キャンセル</button>
                  <button className="btn btn-primary" onClick={handleSaveScannedItem} disabled={isFetchingName}>{isExistingItem ? "上書き保存する" : "保存する"}</button>
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
                      {item.manufacturerName && <div className="item-manufacturer" style={{ fontSize: '0.85rem', color: 'var(--secondary-color)', marginTop: '4px' }}>{item.manufacturerName}</div>}
                    </div>
                    <div className="item-actions">
                      <div className="item-quantity">
                        <span className="qty-label">数量:</span>
                        <div className="quantity-control-group small">
                          <button 
                            className="btn btn-qty small" 
                            onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                          >
                            -
                          </button>
                          <div className="quantity-display small">{item.quantity}</div>
                          <button 
                            className="btn btn-qty small" 
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            +
                          </button>
                        </div>
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
            
            <div className="form-group">
              <label>Yahoo!ショッピングAPI Client ID</label>
              <input 
                type="text" 
                value={clientId} 
                onChange={(e) => setClientId(e.target.value)} 
                placeholder="Client ID を入力してください"
                className="form-control" 
              />
              <small>※ 登録するとJANコードから商品名を自動取得します。<br/>(※外部API仕様によりブラウザから直接呼べない場合は自動取得されません)</small>
            </div>

            <hr />
            <div className="form-group">
              <h3>アプリの更新</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>新しいバージョンが配信されているか手動で確認します。</p>
              <button className="btn btn-outline" onClick={() => {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistration().then(reg => {
                    if (reg) {
                      // すでに新しいバージョンが待機中の場合は強制的に更新してリロードする
                      if (reg.waiting) {
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        // 少し待ってからリロード
                        setTimeout(() => window.location.reload(), 500);
                        return;
                      }

                      reg.update().then(() => {
                        // update後、すぐにwaitingになったかチェック
                        if (reg.waiting) {
                          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                          setTimeout(() => window.location.reload(), 500);
                        } else {
                          alert("更新のチェックが完了しました。新しいバージョンがある場合は画面下部に通知が表示されます。");
                        }
                      }).catch(err => {
                        alert("更新チェックに失敗しました: " + err);
                      });
                    } else {
                      alert("Service Workerが登録されていません。（PWAとしてインストールされていない可能性があります）");
                    }
                  });
                } else {
                  alert("お使いのブラウザは更新チェックに対応していません。");
                }
              }}>
                最新バージョンをチェック
              </button>
            </div>

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
