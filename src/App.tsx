import { useState, useRef } from 'react'
import { useInventory } from './hooks/useInventory'
import { useSettings } from './hooks/useSettings'
import { Scanner } from './components/Scanner'
import { ReloadPrompt } from './components/ReloadPrompt'
import { Camera, List as ListIcon, Settings, Download, Upload, Trash2, Loader2, Edit2, Image as ImageIcon, X, RefreshCw } from 'lucide-react'
import './index.css'

function App() {
  const { items, addOrUpdateItem, updateQuantity, removeItem, clearAll, exportCSV, importCSV } = useInventory();
  const { clientId, setClientId, userName, setUserName, serpApiKey, setSerpApiKey, categories, addCategory } = useSettings();
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
  const [isSearchingImage, setIsSearchingImage] = useState(false);
  const [imageSearchError, setImageSearchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [forceUpdateRequestId, setForceUpdateRequestId] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 編集ダイアログ用ステート
  const [editingItem, setEditingItem] = useState<{id: string, name: string, manufacturer: string, category: string, imageUrl: string | null} | null>(null);
  const [isEditingImageSearching, setIsEditingImageSearching] = useState(false);
  const [editingImageSearchError, setEditingImageSearchError] = useState<string | null>(null);

  const buildImageSearchQuery = (manufacturer: string, productName: string) =>
    [manufacturer.trim(), productName.trim()]
      .filter(Boolean)
      .join(' ');

  const fetchGoogleImageUrl = async (query: string): Promise<string | null> => {
    if (!serpApiKey) {
      console.warn('SerpApi key is not set');
      return null;
    }

    const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&api_key=${serpApiKey}`;
    
    const fetchViaProxy = async (proxyBaseUrl: string) => {
      const urlWithBuster = `${searchUrl}&_=${Date.now()}`;
      const targetUrl = encodeURIComponent(urlWithBuster);
      const proxyUrl = proxyBaseUrl.includes('allorigins') 
        ? `${proxyBaseUrl}${targetUrl}`
        : `${proxyBaseUrl}${targetUrl}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); 
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
        
        if (data.images_results && data.images_results.length > 0) {
          return data.images_results[0].original || data.images_results[0].thumbnail || null;
        }
        throw new Error("No image results");
      } finally {
        clearTimeout(timeoutId);
      }
    };

    try {
      // 複数のプロキシで同時に検索を開始
      return await Promise.any([
        fetchViaProxy('https://api.allorigins.win/get?url='),
        fetchViaProxy('https://corsproxy.io/?url=')
      ]);
    } catch (error) {
      console.error('SerpApi image search failed across all proxies:', error);
      return null;
    }
  };

  const fetchProductInfo = async (janCode: string): Promise<{name: string, manufacturer: string, imageUrl: string | null} | null> => {
    setApiError(null);
    setIsFetchingName(true);

    const fetchFromYahoo = async () => {
      if (!clientId) return null;
      const baseUrl = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?appid=${clientId}&jan_code=${janCode}`;
      
      const fetchDirect = async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          const response = await fetch(baseUrl, { signal: controller.signal });
          clearTimeout(timeout);
          if (response.ok) {
            const data = await response.json();
            if (data.hits && data.hits.length > 0) return data;
          }
          throw new Error("Direct fetch failed");
        } catch (e) {
          clearTimeout(timeout);
          throw e;
        }
      };

      const fetchViaProxy = async (proxyBaseUrl: string) => {
        const baseUrlWithBuster = `${baseUrl}&_=${Date.now()}`;
        const targetUrl = encodeURIComponent(baseUrlWithBuster);
        const proxyUrl = proxyBaseUrl.includes('allorigins') 
          ? `${proxyBaseUrl}${targetUrl}`
          : `${proxyBaseUrl}${targetUrl}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(proxyUrl, { signal: controller.signal });
          if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);
          
          let data;
          if (proxyUrl.includes('allorigins')) {
            const proxyData = await response.json();
            if (!proxyData.contents) throw new Error("Invalid allorigins response");
            data = JSON.parse(proxyData.contents);
          } else {
            data = await response.json();
          }
          
          if (data.hits && data.hits.length > 0) return data;
          throw new Error("No hits via proxy");
        } finally {
          clearTimeout(timeoutId);
        }
      };

      try {
        // 直接通信と2つのプロキシを同時に開始
        const data = await Promise.any([
          fetchDirect(),
          fetchViaProxy('https://api.allorigins.win/get?url='),
          fetchViaProxy('https://corsproxy.io/?url=')
        ]);

        if (data && data.hits && data.hits.length > 0) {
          const item = data.hits[0];
          return {
            name: item.name,
            manufacturer: item.brand?.name || "",
            imageUrl: item.image?.medium || item.image?.small || null
          };
        }
      } catch (error) {
        console.error("All Yahoo fetch attempts failed:", error);
      }
      return null;
    };

    const fetchFromOpenFoodFacts = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${janCode}.json`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        if (data.status === 1 && data.product) {
          return {
            name: data.product.product_name || data.product.product_name_ja || "",
            manufacturer: data.product.brands || "",
            imageUrl: data.product.image_url || data.product.image_front_url || null
          };
        }
      } catch (error) {
        console.error("Open Food Facts fetch failed:", error);
      } finally {
        clearTimeout(timeoutId);
      }
      return null;
    };

    const fetchFromSerpApi = async () => {
      if (!serpApiKey) return null;
      try {
        // JANコードそのもので画像検索（製品情報がヒットすることが多いため）
        const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=${janCode}&api_key=${serpApiKey}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(searchUrl)}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) return null;
        const data = await response.json();
        const serpData = JSON.parse(data.contents);
        
        if (serpData.images_results && serpData.images_results.length > 0) {
          const firstResult = serpData.images_results[0];
          return {
            name: firstResult.title || "",
            manufacturer: "", // タイトルから分離するのは難しいため空
            imageUrl: firstResult.original || firstResult.thumbnail || null
          };
        }
      } catch (error) {
        console.error("SerpApi fallback fetch failed:", error);
      }
      return null;
    };

    try {
      // 全ての経路で同時に取得を開始
      const [yahooResult, offResult, serpResult] = await Promise.all([
        fetchFromYahoo(),
        fetchFromOpenFoodFacts(),
        fetchFromSerpApi()
      ]);
      
      // 優先順位に従って結果を採用する: Yahoo > Open Food Facts > SerpApi
      if (yahooResult) return yahooResult;
      if (offResult) return offResult;
      if (serpResult) return serpResult;

      setApiError("商品が見つかりませんでした。商品名を手入力し、必要なら画像を探してください。");
    } catch (error: any) {
      console.error("API Fetch Error:", error);
      setApiError(`通信エラーが発生しました。手入力してください。`);
    } finally {
      setIsFetchingName(false);
    }
    
    return null;
  };

  const handleScan = async (decodedText: string) => {
    setIsScanning(false);
    setScannedJan(decodedText);
    setApiError(null);
    setImageSearchError(null);
    
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
      
      const info = await fetchProductInfo(decodedText);
      if (info) {
        setProductNameInput(info.name);
        setManufacturerInput(info.manufacturer);
        setImageUrlInput(info.imageUrl);
      }
    }
  };

  const handleSearchImage = async () => {
    const query = buildImageSearchQuery(manufacturerInput, productNameInput);

    if (!productNameInput.trim() || !manufacturerInput.trim()) {
      setImageSearchError('メーカー名と商品名の両方を入力してから画像を探してください。');
      return;
    }

    setIsSearchingImage(true);
    setImageSearchError(null);

    try {
      const foundImageUrl = await fetchGoogleImageUrl(query);
      if (!foundImageUrl) {
        setImageSearchError('画像が見つかりませんでした。商品名やメーカー名を調整してください。');
        return;
      }

      setImageUrlInput(foundImageUrl);
    } catch (error) {
      console.error('SerpApi image search failed:', error);
      setImageSearchError('画像検索に失敗しました。時間をおいて再試行してください。');
    } finally {
      setIsSearchingImage(false);
    }
  };

  const handleEditSearchImage = async () => {
    if (!editingItem) return;

    const query = buildImageSearchQuery(editingItem.manufacturer, editingItem.name);

    if (!editingItem.name.trim() || !editingItem.manufacturer.trim()) {
      setEditingImageSearchError('メーカー名と商品名の両方を入力してから画像を探してください。');
      return;
    }

    setIsEditingImageSearching(true);
    setEditingImageSearchError(null);

    try {
      const foundImageUrl = await fetchGoogleImageUrl(query);
      if (!foundImageUrl) {
        setEditingImageSearchError('画像が見つかりませんでした。商品名やメーカー名を調整してください。');
        return;
      }

      setEditingItem((current) => current ? { ...current, imageUrl: foundImageUrl } : current);
    } catch (error) {
      console.error('SerpApi image search failed:', error);
      setEditingImageSearchError('画像検索に失敗しました。時間をおいて再試行してください。');
    } finally {
      setIsEditingImageSearching(false);
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
    setImageSearchError(null);
  };

  const handleCancelScan = () => {
    if (window.confirm("スキャンした情報を破棄してキャンセルしますか？")) {
      setScannedJan(null);
      setIsExistingItem(false);
      setOriginalQuantity(null);
      setImageUrlInput(null);
      setCategoryInput("");
      setImageSearchError(null);
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
          imageUrl: editingItem.imageUrl || undefined,
          quantity: itemToUpdate.quantity,
          userName: itemToUpdate.userName
        });
      }
      setEditingItem(null);
      setEditingImageSearchError(null);
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

  const handleCheckUpdate = () => {
    if (!('serviceWorker' in navigator)) {
      alert("このブラウザはアップデート機能に対応していません。");
      return;
    }

    setForceUpdateRequestId((current) => current + 1);
  };

  const filteredItems = items.filter(item => 
    item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.manufacturerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.category || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.janCode.includes(searchQuery)
  );

  return (
    <div className="app-container">
      <ReloadPrompt forceUpdateRequestId={forceUpdateRequestId} />

      <main className="app-main">
        {activeTab === 'scan' && (
          <div className="scan-section" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!scannedJan ? (
              <div className="scanner-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: '60px' }}>
                {isScanning ? (
                  <>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <Scanner isActive={isScanning} onScan={handleScan} />
                    </div>
                    <button 
                      className="btn btn-secondary mt-4" 
                      style={{ flexShrink: 0, margin: '1rem', marginBottom: '0.5rem' }} 
                      onClick={() => setIsScanning(false)}
                    >
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
              <div className="input-form card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden', margin: 0, borderRadius: 0, border: 'none' }}>
                {/* 上部：スクロール可能な商品情報エリア */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
                  <h3 style={{ marginTop: 0, fontSize: '1.1rem' }}>商品登録 {isExistingItem ? <span className="badge badge-info">リスト登録済</span> : <span className="badge badge-success">新規</span>}</h3>
                  
                  <div className="form-group" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div 
                      className="product-image-container" 
                      style={{ width: '70px', height: '70px', flexShrink: 0, backgroundColor: '#e9ecef', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', border: !imageUrlInput ? '2px dashed #adb5bd' : 'none' }}
                    >
                      {imageUrlInput ? (
                        <img src={imageUrlInput} alt="商品画像" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; setImageUrlInput(null); }} />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#adb5bd' }}>
                          <ImageIcon size={20} style={{ margin: '0 auto' }} />
                          <span style={{ fontSize: '0.55rem', display: 'block' }}>画像なし</span>
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.9rem' }}>JANコード</label>
                      <input type="text" value={scannedJan} readOnly className="form-control readonly" style={{ padding: '0.5rem' }} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '0.9rem' }}>商品分類</label>
                    <div className="category-tags-container" style={{ display: 'flex', overflowX: 'auto', gap: '0.4rem', marginBottom: '0.25rem', paddingBottom: '4px', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch' }}>
                      {categories.map(cat => (
                        <button 
                          key={cat} 
                          className={`tag-btn ${categoryInput === cat ? 'active' : ''}`}
                          onClick={() => setCategoryInput(cat)}
                          style={{ flexShrink: 0 }}
                        >
                          {cat}
                        </button>
                      ))}
                      <button className="tag-btn add-btn" onClick={handleAddNewCategory} style={{ flexShrink: 0 }}>+ 新規</button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '0.9rem' }}>メーカー名 / ブランド</label>
                    <input 
                      type="text" 
                      value={manufacturerInput} 
                      onChange={(e) => {
                        setManufacturerInput(e.target.value);
                        setImageSearchError(null);
                      }} 
                      placeholder="手入力できます"
                      className="form-control" 
                      disabled={isFetchingName}
                      style={{ padding: '0.5rem' }}
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ marginBottom: '2px', fontSize: '0.9rem' }}>商品名</label>
                    <div style={{ position: 'relative' }}>
                      <textarea 
                        value={productNameInput} 
                        onChange={(e) => {
                          setProductNameInput(e.target.value);
                          setImageSearchError(null);
                        }} 
                        placeholder={isFetchingName ? "取得中..." : "手入力できます"}
                        className="form-control" 
                        disabled={isFetchingName}
                        rows={2}
                        style={{ resize: 'none', padding: '0.5rem' }}
                      />
                      {isFetchingName && (
                        <Loader2 className="spinner" style={{ position: 'absolute', right: '10px', top: '10px', color: 'var(--primary-color)' }} />
                      )}
                    </div>
                    {apiError && (
                      <div style={{ marginTop: '4px' }}>
                        <small style={{ color: 'red', display: 'block', marginBottom: '4px', fontSize: '0.75rem' }}>{apiError}</small>
                      </div>
                    )}
                      <div style={{ marginTop: '0.5rem' }}>
                        <button
                          className="btn btn-outline"
                          onClick={handleSearchImage}
                          disabled={isFetchingName || isSearchingImage || !productNameInput.trim() || !manufacturerInput.trim()}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                        >
                          {isSearchingImage ? <Loader2 className="spinner icon-small" /> : <ImageIcon className="icon-small" />}
                          {imageUrlInput ? '画像を再検索' : 'インターネットから画像を探す'}
                        </button>
                        <small style={{ display: 'block', marginTop: '4px', fontSize: '0.75rem' }}>
                          ※ 商品名とメーカー名をもとにインターネットから画像検索します。
                        </small>
                      </div>
                    {imageSearchError && (
                      <div style={{ marginTop: '4px' }}>
                        <small style={{ color: 'red', display: 'block', marginBottom: '4px', fontSize: '0.75rem' }}>{imageSearchError}</small>
                      </div>
                    )}
                  </div>
                </div>

                {/* 下部：固定操作エリア */}
                <div style={{ flexShrink: 0, padding: '0.75rem 1.25rem', paddingBottom: '70px', backgroundColor: '#fff', borderTop: '1px solid var(--border-color)', boxShadow: '0 -2px 8px rgba(0,0,0,0.05)' }}>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ marginBottom: 0, fontSize: '0.9rem' }}>
                        数量 
                        {isExistingItem && originalQuantity !== null && <span style={{ color: 'var(--secondary-color)', fontSize: '0.75rem', marginLeft: '6px' }}>(旧: {originalQuantity})</span>}
                      </label>
                    </div>
                    <div className="quantity-control-group large" style={{ marginTop: 0 }}>
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
                  <div className="form-actions large-actions" style={{ marginTop: 0 }}>
                    <button className="btn btn-secondary btn-large" onClick={handleCancelScan}>キャンセル</button>
                    <button className="btn btn-primary btn-large" onClick={handleSaveScannedItem} disabled={isFetchingName}>{isExistingItem ? "上書き保存する" : "保存する"}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'list' && (
          <div className="list-section" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '1rem', paddingBottom: '70px' }}>
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
            
            <div style={{ flex: 1, overflowY: 'auto', marginTop: '1rem' }}>
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
                            <button className="btn-icon" onClick={() => {
                              setEditingItem({
                                id: item.id,
                                name: item.productName,
                                manufacturer: item.manufacturerName || "",
                                category: item.category || "",
                                imageUrl: item.imageUrl || null
                              });
                              setEditingImageSearchError(null);
                            }}>
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
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-section">
            <div className="settings-section-inner card">
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

              <div className="form-group mt-4">
                <label>SerpApi API Key (Google Images Search)</label>
                <input 
                  type="text" 
                  value={serpApiKey} 
                  onChange={(e) => setSerpApiKey(e.target.value)} 
                  placeholder="SerpApi Key を入力してください"
                  className="form-control" 
                />

                <small>※ 登録するとメーカー名や商品名から、より精度の高い画像を自動取得します。</small>
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

              <div className="form-group mt-4">
                <h3>システム</h3>
                <div className="form-actions" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                  <button className="btn btn-outline" onClick={handleCheckUpdate} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                    <RefreshCw className="icon" /> アップデートする
                  </button>
                </div>
                <small>※ 最新コードを強制取得して再起動します。新しいバージョンがあれば自動で適用します。</small>
              </div>

              <div className="danger-zone mt-4">
                <h3>リセット</h3>
                <p>全てのデータを消去し、初期状態に戻します。</p>
                <button className="btn btn-danger" onClick={() => {
                  if (window.confirm("本当に全てのデータを削除しますか？この操作は取り消せません。")) {
                    clearAll();
                    alert("全てのデータを削除しました。");
                  }
                }}>
                  <Trash2 className="icon" /> 全データを削除
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <button 
          className={`nav-btn ${activeTab === 'scan' ? 'active' : ''}`} 
          onClick={() => { setActiveTab('scan'); setIsScanning(false); setScannedJan(null); }}
        >
          <Camera />
          <span>スキャン</span>
        </button>
        <button 
          className={`nav-btn ${activeTab === 'list' ? 'active' : ''}`} 
          onClick={() => setActiveTab('list')}
        >
          <ListIcon />
          <span>リスト</span>
        </button>
        <button 
          className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} 
          onClick={() => setActiveTab('settings')}
        >
          <Settings />
          <span>設定</span>
        </button>
      </nav>

      {/* 編集モーダル */}
      {editingItem && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h3>商品情報の編集</h3>
            <div className="form-group">
              <label>商品分類</label>
              <div className="category-tags-container" style={{ display: 'flex', overflowX: 'auto', gap: '0.4rem', marginBottom: '0.25rem', paddingBottom: '4px', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch' }}>
                {categories.map(cat => (
                  <button 
                    key={cat} 
                    className={`tag-btn ${editingItem.category === cat ? 'active' : ''}`}
                    onClick={() => setEditingItem({...editingItem, category: cat})}
                    style={{ flexShrink: 0 }}
                  >
                    {cat}
                  </button>
                ))}
                <button className="tag-btn add-btn" onClick={handleEditAddNewCategory} style={{ flexShrink: 0 }}>+ 新規</button>
              </div>
            </div>
            <div className="form-group">
              <label>メーカー名</label>
              <input 
                type="text" 
                value={editingItem.manufacturer} 
                onChange={(e) => {
                  setEditingItem({...editingItem, manufacturer: e.target.value});
                  setEditingImageSearchError(null);
                }} 
                className="form-control"
              />
            </div>
            <div className="form-group">
              <label>商品名</label>
              <textarea 
                value={editingItem.name} 
                onChange={(e) => {
                  setEditingItem({...editingItem, name: e.target.value});
                  setEditingImageSearchError(null);
                }} 
                className="form-control"
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>画像</label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <div style={{ width: '72px', height: '72px', flexShrink: 0, backgroundColor: '#e9ecef', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', border: !editingItem.imageUrl ? '2px dashed #adb5bd' : 'none' }}>
                  {editingItem.imageUrl ? (
                    <img
                      src={editingItem.imageUrl}
                      alt="商品画像"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        setEditingItem((current) => current ? { ...current, imageUrl: null } : current);
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#6c757d' }}>画像なし</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <button
                    className="btn btn-outline"
                    onClick={handleEditSearchImage}
                    disabled={isEditingImageSearching || !editingItem.name.trim() || !editingItem.manufacturer.trim()}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    {isEditingImageSearching ? <Loader2 className="spinner icon-small" /> : <ImageIcon className="icon-small" />}
                    {editingItem.imageUrl ? '画像を再検索' : 'インターネットから画像を探す'}
                  </button>
                  <small style={{ display: 'block', marginTop: '4px', fontSize: '0.75rem' }}>
                    ※ 商品名とメーカー名をもとにインターネットから画像検索します。
                  </small>
                  {editingImageSearchError && (
                    <small style={{ color: 'red', display: 'block', marginTop: '4px', fontSize: '0.75rem' }}>
                      {editingImageSearchError}
                    </small>
                  )}
                </div>
              </div>
            </div>
            <div className="form-actions" style={{ gap: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => { setEditingItem(null); setEditingImageSearchError(null); }} style={{ padding: '1.2rem', fontSize: '1.1rem' }}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} style={{ padding: '1.2rem', fontSize: '1.1rem' }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
