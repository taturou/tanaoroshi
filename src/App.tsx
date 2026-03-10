import { useState, useRef } from 'react'
import { useInventory } from './hooks/useInventory'
import { useSettings } from './hooks/useSettings'
import { Scanner } from './components/Scanner'
import { ReloadPrompt } from './components/ReloadPrompt'
import { Camera, List as ListIcon, Settings, Download, Upload, Trash2, Loader2, Edit2, Image as ImageIcon, X } from 'lucide-react'
import './index.css'

function App() {
  const { items, addOrUpdateItem, updateQuantity, removeItem, clearAll, exportCSV, importCSV } = useInventory();
  const { clientId, setClientId, userName, setUserName, categories, addCategory } = useSettings();
  const [activeTab, setActiveTab] = useState<'scan' | 'list' | 'settings'>('scan');
  
  // スキャン中の状態管理
  const [isScanning, setIsScanning] = useState(false);
  const [scannedJan, setScannedJan] = useState<string | null>(null);
  const [quantityInput, setQuantityInput] = useState<number>(1);
  const [productNameInput, setProductNameInput] = useState<string>("");
  const [manufacturerInput, setManufacturerInput] = useState<string>("");
  const [categoryInput, setCategoryInput] = useState<string>("");
  const [imageUrlInput, setImageUrlInput] = useState<string | null>(null);
  const [isFetchingName, setIsFetchingName] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isExistingItem, setIsExistingItem] = useState<boolean>(false);
  const [originalQuantity, setOriginalQuantity] = useState<number | null>(null);
  const [isApiFetched, setIsApiFetched] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 編集ダイアログ用ステート
  const [editingItem, setEditingItem] = useState<{id: string, name: string, manufacturer: string, category: string} | null>(null);

  const fetchProductInfo = async (janCode: string, retries = 2): Promise<{name: string, manufacturer: string, imageUrl: string | null} | null> => {
    if (!clientId) return null;
    
    setApiError(null);
    setIsFetchingName(true);

    const targetUrl = encodeURIComponent(`https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?appid=${clientId}&jan_code=${janCode}`);
    
    const proxies = [
      `https://api.allorigins.win/get?url=${targetUrl}`,
      `https://corsproxy.io/?url=${targetUrl}`
    ];

    const fetchFromProxy = async (proxyUrl: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(proxyUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        let data;
        if (proxyUrl.includes('allorigins')) {
          const proxyData = await response.json();
          if (!proxyData.contents) throw new Error("Invalid allorigins response");
          data = JSON.parse(proxyData.contents);
        } else {
          data = await response.json();
        }
        
        if (data.Error) throw new Error(`API Error: ${data.Error.Message}`);
        return data;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = await Promise.any(proxies.map(p => fetchFromProxy(p)));
        
        if (data.hits && data.hits.length > 0) {
          setIsFetchingName(false);
          const item = data.hits[0];
          const manufacturer = item.brand?.name || "";
          const imageUrl = item.image?.medium || item.image?.small || null;
          return { name: item.name, manufacturer, imageUrl };
        } else {
          setApiError("商品がデータベースに見つかりませんでした。");
          setIsFetchingName(false);
          return null;
        }
      } catch (error: any) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        if (attempt === retries) {
          setApiError(`通信エラー: プロキシサーバーが応答しません。手入力してください。`);
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
    setIsApiFetched(false);
    
    const existingItem = items.find(item => item.janCode === decodedText);
    
    if (existingItem) {
      setIsExistingItem(true);
      setOriginalQuantity(existingItem.quantity);
      setProductNameInput(existingItem.productName);
      setManufacturerInput(existingItem.manufacturerName || "");
      setCategoryInput(existingItem.category || "");
      setImageUrlInput(existingItem.imageUrl || null);
      setQuantityInput(existingItem.quantity + 1);
    } else {
      setIsExistingItem(false);
      setOriginalQuantity(null);
      setQuantityInput(1);
      setProductNameInput("");
      setManufacturerInput("");
      setCategoryInput("");
      setImageUrlInput(null);
      
      if (clientId) {
        const info = await fetchProductInfo(decodedText);
        if (info) {
          setProductNameInput(info.name);
          setManufacturerInput(info.manufacturer);
          setImageUrlInput(info.imageUrl);
          setIsApiFetched(true);
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
      category: categoryInput,
      imageUrl: imageUrlInput || undefined,
      quantity: quantityInput,
      userName: userName || "未設定",
    });
    
    setScannedJan(null);
    setQuantityInput(1);
    setProductNameInput("");
    setManufacturerInput("");
    setCategoryInput("");
    setImageUrlInput(null);
    setIsExistingItem(false);
    setOriginalQuantity(null);
    setIsApiFetched(false);
  };

  const handleCancelScan = () => {
    if (window.confirm("スキャンした情報を破棄してキャンセルしますか？")) {
      setScannedJan(null);
      setIsExistingItem(false);
      setOriginalQuantity(null);
      setIsApiFetched(false);
      setImageUrlInput(null);
      setCategoryInput("");
    }
  };

  const handleSaveEdit = () => {
    if (editingItem) {
      const itemToUpdate = items.find(i => i.id === editingItem.id);
      if (itemToUpdate) {
        addOrUpdateItem({
          janCode: itemToUpdate.janCode,
          productName: editingItem.name,
          manufacturerName: editingItem.manufacturer,
          category: editingItem.category,
          imageUrl: itemToUpdate.imageUrl,
          quantity: itemToUpdate.quantity,
          userName: itemToUpdate.userName
        });
      }
      setEditingItem(null);
    }
  };

  const handleExportCSV = () => {
    let exportUserName = userName;
    if (!exportUserName || exportUserName.trim() === "") {
      const input = window.prompt("CSVに出力する担当者名を入力してください。\n（※複数人で合算する際に必要になるため必須です）");
      if (input === null || input.trim() === "") {
        alert("エラー: 担当者名が入力されなかったため、CSV出力を中断しました。");
        return; 
      }
      exportUserName = input.trim();
      setUserName(exportUserName);
    }
    exportCSV(exportUserName);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const modeChoice = window.confirm("「OK」を押すと現在のリストにCSVのデータを追加（マージ）します。\n「キャンセル」を押すと現在のリストを消去してCSVのデータで上書き（リプレイス）します。");
    const mode = modeChoice ? 'merge' : 'replace';

    if (!modeChoice) {
      if (!window.confirm("本当に現在のデータを全て消去して上書きしますか？")) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return; 
      }
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        importCSV(content, mode);
        alert("CSVの読み込みが完了しました。");
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddNewCategory = () => {
    const newCat = window.prompt("新しい分類タグ名を入力してください。");
    if (newCat && newCat.trim()) {
      addCategory(newCat.trim());
      setCategoryInput(newCat.trim());
    }
  };

  const handleEditAddNewCategory = () => {
    const newCat = window.prompt("新しい分類タグ名を入力してください。");
    if (newCat && newCat.trim() && editingItem) {
      addCategory(newCat.trim());
      setEditingItem({...editingItem, category: newCat.trim()});
    }
  };

  const isInputLocked = isExistingItem || isApiFetched;

  const filteredItems = items.filter(item => 
    item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.manufacturerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.category || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.janCode.includes(searchQuery)
  );

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
                
                <div className="form-group" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div className="product-image-container" style={{ width: '80px', height: '80px', flexShrink: 0, backgroundColor: '#e9ecef', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                    {imageUrlInput ? (
                      <img src={imageUrlInput} alt="商品画像" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; setImageUrlInput(null); }} />
                    ) : (
                      <div style={{ textAlign: 'center', color: '#adb5bd' }}>
                        <ImageIcon style={{ margin: '0 auto' }} />
                        <span style={{ fontSize: '0.6rem', display: 'block' }}>No Image</span>
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>JANコード</label>
                    <input type="text" value={scannedJan} readOnly className="form-control readonly" />
                  </div>
                </div>

                <div className="form-group">
                  <label>商品分類</label>
                  <div className="category-tags-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {categories.map(cat => (
                      <button 
                        key={cat} 
                        className={`tag-btn ${categoryInput === cat ? 'active' : ''}`}
                        onClick={() => setCategoryInput(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                    <button className="tag-btn add-btn" onClick={handleAddNewCategory}>+ 新規</button>
                  </div>
                </div>

                <div className="form-group">
                  <label>メーカー名 / ブランド</label>
                  <input 
                    type="text" 
                    value={manufacturerInput} 
                    onChange={(e) => setManufacturerInput(e.target.value)} 
                    placeholder="手入力できます"
                    className={`form-control ${(isInputLocked && manufacturerInput) ? 'readonly' : ''}`} 
                    disabled={isFetchingName}
                    readOnly={!!(isInputLocked && manufacturerInput)}
                  />
                </div>

                <div className="form-group">
                  <label>商品名</label>
                  <div style={{ position: 'relative' }}>
                    <textarea 
                      value={productNameInput} 
                      onChange={(e) => setProductNameInput(e.target.value)} 
                      placeholder={isFetchingName ? "取得中..." : "手入力できます"}
                      className={`form-control ${(isInputLocked && productNameInput) ? 'readonly' : ''}`} 
                      disabled={isFetchingName}
                      readOnly={!!(isInputLocked && productNameInput)}
                      rows={2}
                      style={{ resize: 'none' }}
                    />
                    {isFetchingName && <Loader2 className="spinner" style={{ position: 'absolute', right: '10px', top: '10px', color: 'var(--primary-color)' }} />}
                  </div>
                  {apiError && <small style={{ color: 'red', display: 'block', marginTop: '4px' }}>{apiError}</small>}
                </div>

                <div className="form-group">
                  <label>
                    数量 
                    {isExistingItem && originalQuantity !== null && <span style={{ color: 'var(--secondary-color)', fontSize: '0.85rem', marginLeft: '8px' }}>(元の数量: {originalQuantity})</span>}
                  </label>
                  <div className="quantity-control-group large">
                    <button 
                      className="btn btn-qty btn-minus" 
                      onClick={() => setQuantityInput(prev => Math.max(1, prev - 1))}
                    >
                      -
                    </button>
                    <div className="quantity-display large">{quantityInput}</div>
                    <button 
                      className="btn btn-qty btn-plus" 
                      onClick={() => setQuantityInput(prev => prev + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="form-actions large-actions">
                  <button className="btn btn-secondary btn-large" onClick={handleCancelScan}>キャンセル</button>
                  <button className="btn btn-primary btn-large" onClick={handleSaveScannedItem} disabled={isFetchingName}>{isExistingItem ? "上書き保存する" : "保存する"}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'list' && (
          <div className="list-section">
            <div className="list-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>記録データ ({items.length}件)</h2>
              </div>
              <div className="search-box-container" style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  placeholder="商品名・分類・JANなどで検索..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-control"
                  style={{ paddingRight: '40px' }}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '5px' }}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>
            
            {items.length === 0 ? (
              <p className="empty-state">データがありません</p>
            ) : filteredItems.length === 0 ? (
              <p className="empty-state">検索結果が見つかりません</p>
            ) : (
              <ul className="inventory-list">
                {filteredItems.map(item => (
                  <li key={item.id} className="inventory-item card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      {/* 左側の画像エリア */}
                      <div className="item-image" style={{ width: '60px', height: '60px', flexShrink: 0, backgroundColor: '#e9ecef', borderRadius: '6px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} loading="lazy" />
                        ) : (
                          <ImageIcon className="icon-small" style={{ color: '#adb5bd' }} />
                        )}
                      </div>

                      {/* 右側のJANと分類・メーカー */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="item-jan" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                          <span>{item.janCode}</span>
                          <button className="btn-icon" onClick={() => setEditingItem({ id: item.id, name: item.productName, manufacturer: item.manufacturerName || "", category: item.category || "" })}>
                            <Edit2 className="icon-small" style={{ color: 'var(--primary-color)' }} />
                          </button>
                        </div>
                        {item.category && (
                          <div className="item-category" style={{ fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 'bold' }}>
                            [{item.category}]
                          </div>
                        )}
                        {item.manufacturerName && (
                          <div className="item-manufacturer" style={{ fontSize: '0.9rem', color: 'var(--secondary-color)' }}>
                            {item.manufacturerName}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 下段の商品名 */}
                    <div className="item-name" style={{ fontSize: '1.1rem', wordBreak: 'break-all', borderTop: '1px dashed var(--border-color)', paddingTop: '0.5rem', fontWeight: 'bold' }}>
                      {item.productName}
                    </div>
                    
                    <div className="item-actions">
                      <div className="item-quantity">
                        <span className="qty-label">数量:</span>
                        <div className="quantity-control-group small">
                          <button 
                            className="btn btn-qty btn-minus small" 
                            onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                          >
                            -
                          </button>
                          <div className="quantity-display small">{item.quantity}</div>
                          <button 
                            className="btn btn-qty btn-plus small" 
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <button className="btn-icon text-danger" onClick={() => {
                        if (window.confirm(`「${item.productName}」をリストから削除しますか？`)) {
                          removeItem(item.id);
                        }
                      }}>
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
              <label>担当者名</label>
              <input 
                type="text" 
                value={userName} 
                onChange={(e) => setUserName(e.target.value)} 
                placeholder="ユーザ名を入力（空欄可）"
                className="form-control" 
              />
              <small>※ スキャンした商品データの「ユーザ名」列に記録されます。</small>
            </div>

            <div className="form-group mt-4">
              <label>Yahoo!ショッピングAPI Client ID</label>
              <input 
                type="text" 
                value={clientId} 
                onChange={(e) => setClientId(e.target.value)} 
                placeholder="Client ID を入力してください"
                className="form-control" 
              />
              <small>※ 登録するとJANコードから商品名と画像を自動取得します。</small>
            </div>

            <hr />
            <div className="form-group">
              <h3>データ入出力</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>記録データをCSV形式で出力したり、外部のCSVデータを読み込んでリストを復元・合算できます。</p>
              
              <div className="form-actions" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={handleExportCSV} disabled={items.length === 0}>
                  <Download className="icon" /> CSVを出力する
                </button>
                
                <label className="btn btn-outline" style={{ display: 'inline-flex', justifyContent: 'center' }}>
                  <Upload className="icon" /> CSVを読み込む
                  <input 
                    type="file" 
                    accept=".csv" 
                    onChange={handleImportCSV} 
                    style={{ display: 'none' }} 
                    ref={fileInputRef}
                  />
                </label>
              </div>
            </div>

            <hr />
            <div className="form-group">
              <h3>アプリの更新</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>新しいバージョンが配信されているか手動で確認します。</p>
              <button className="btn btn-outline" onClick={() => {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistration().then(reg => {
                    if (reg) {
                      if (reg.waiting) {
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        setTimeout(() => window.location.reload(), 500);
                        return;
                      }

                      reg.update().then(() => {
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

      {/* 編集用モーダルダイアログ */}
      {editingItem && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h3>商品情報の編集</h3>
            <div className="form-group">
              <label>JANコード</label>
              <input 
                type="text" 
                value={items.find(i => i.id === editingItem.id)?.janCode || ""} 
                readOnly 
                className="form-control readonly" 
              />
            </div>
            <div className="form-group">
              <label>商品分類</label>
              <div className="category-tags-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {categories.map(cat => (
                  <button 
                    key={cat} 
                    className={`tag-btn ${editingItem.category === cat ? 'active' : ''}`}
                    onClick={() => setEditingItem({...editingItem, category: cat})}
                  >
                    {cat}
                  </button>
                ))}
                <button className="tag-btn add-btn" onClick={handleEditAddNewCategory}>+ 新規</button>
              </div>
            </div>
            <div className="form-group">
              <label>メーカー名 / ブランド</label>
              <input 
                type="text" 
                value={editingItem.manufacturer} 
                onChange={(e) => setEditingItem({...editingItem, manufacturer: e.target.value})} 
                className="form-control"
              />
            </div>
            <div className="form-group">
              <label>商品名</label>
              <textarea 
                value={editingItem.name} 
                onChange={(e) => setEditingItem({...editingItem, name: e.target.value})} 
                className="form-control"
                rows={2}
              />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setEditingItem(null)}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}

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
