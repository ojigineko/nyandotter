// DOM要素の取得
const imageInput = document.getElementById('imageInput');
const convertBtn = document.getElementById('convertBtn');
const downloadBtn = document.getElementById('downloadBtn');
const pixelSizeSlider = document.getElementById('pixelSize');
const pixelSizeValue = document.getElementById('pixelSizeValue');
const colorReductionSlider = document.getElementById('colorReduction');
const colorReductionValue = document.getElementById('colorReductionValue');
const originalCanvas = document.getElementById('originalCanvas');
const pixelatedCanvas = document.getElementById('pixelatedCanvas');
const logContent = document.getElementById('log-content');

// キャンバスコンテキストの取得
const originalCtx = originalCanvas.getContext('2d');
const pixelatedCtx = pixelatedCanvas.getContext('2d');

// グローバル変数
let originalImage = null;
let isProcessing = false;
let lastActivity = Date.now();
let crashDetectionInterval = null;

// ログ機能
const logger = {
    log: function(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${timestamp}] ${message}`;
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
        
        // ログファイルにも記録
        this.saveToLogFile(`[${timestamp}] ${message}`);
    },
    
    error: function(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${timestamp}] エラー: ${message}`;
        logEntry.style.color = 'red';
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
        
        // エラーログファイルに記録
        this.saveToErrorLogFile(`[${timestamp}] エラー: ${message}`);
    },
    
    saveToLogFile: function(message) {
        // 実際のアプリケーションでは、ローカルストレージやIndexedDBに保存するか
        // サーバーにログを送信する実装が必要です
        const logs = JSON.parse(localStorage.getItem('pixelArtConverterLogs') || '[]');
        logs.push(message);
        localStorage.setItem('pixelArtConverterLogs', JSON.stringify(logs));
    },
    
    saveToErrorLogFile: function(message) {
        // エラーログの保存
        const errorLogs = JSON.parse(localStorage.getItem('pixelArtConverterErrorLogs') || '[]');
        errorLogs.push(message);
        localStorage.setItem('pixelArtConverterErrorLogs', JSON.stringify(errorLogs));
    }
};

// クラッシュ検知機能
function setupCrashDetection() {
    // アクティビティ監視
    document.addEventListener('click', updateLastActivity);
    document.addEventListener('keydown', updateLastActivity);
    document.addEventListener('mousemove', updateLastActivity);
    
    // 定期的にチェック
    crashDetectionInterval = setInterval(checkForCrash, 5000);
    
    // ページを離れる前の処理
    window.addEventListener('beforeunload', function(e) {
        if (isProcessing) {
            const message = '処理中です。本当にページを離れますか？';
            e.returnValue = message;
            logger.log('ユーザーがページを離れようとしました');
            return message;
        }
    });
    
    // エラーハンドリング
    window.addEventListener('error', function(e) {
        logger.error(`未処理のエラー: ${e.message} (${e.filename}:${e.lineno})`);
        saveErrorToFile(`未処理のエラー: ${e.message} (${e.filename}:${e.lineno})`);
    });
    
    // Promiseエラーハンドリング
    window.addEventListener('unhandledrejection', function(e) {
        logger.error(`未処理のPromiseエラー: ${e.reason}`);
        saveErrorToFile(`未処理のPromiseエラー: ${e.reason}`);
    });
    
    logger.log('クラッシュ検知機能が有効になりました');
}

function updateLastActivity() {
    lastActivity = Date.now();
}

function checkForCrash() {
    const inactiveTime = Date.now() - lastActivity;
    
    // 処理中に長時間無応答の場合
    if (isProcessing && inactiveTime > 30000) {
        logger.error('アプリケーションが応答していません。処理がフリーズしている可能性があります。');
        isProcessing = false;
        enableUI();
    }
}

function saveErrorToFile(errorMessage) {
    // エラーをファイルに記録
    const errorLog = {
        timestamp: new Date().toISOString(),
        error: errorMessage,
        userAgent: navigator.userAgent,
        url: window.location.href
    };
    
    localStorage.setItem('lastError', JSON.stringify(errorLog));
}

// UIの有効/無効切り替え
function disableUI() {
    convertBtn.disabled = true;
    imageInput.disabled = true;
    pixelSizeSlider.disabled = true;
    colorReductionSlider.disabled = true;
    isProcessing = true;
}

function enableUI() {
    convertBtn.disabled = false;
    imageInput.disabled = false;
    pixelSizeSlider.disabled = false;
    colorReductionSlider.disabled = false;
    isProcessing = false;
}

// スライダーの値表示更新
pixelSizeSlider.addEventListener('input', function() {
    pixelSizeValue.textContent = `${this.value}px`;
});

colorReductionSlider.addEventListener('input', function() {
    colorReductionValue.textContent = `${this.value}色`;
});

// 画像読み込み処理
imageInput.addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        
        // 画像ファイルかチェック
        if (!file.type.match('image.*')) {
            logger.error('選択されたファイルは画像ではありません');
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(event) {
            originalImage = new Image();
            originalImage.onload = function() {
                // 元の画像をキャンバスに描画
                originalCanvas.width = originalImage.width;
                originalCanvas.height = originalImage.height;
                originalCtx.drawImage(originalImage, 0, 0);
                
                logger.log(`画像を読み込みました: ${file.name} (${originalImage.width}x${originalImage.height})`);
                convertBtn.disabled = false;
            };
            originalImage.src = event.target.result;
        };
        
        reader.onerror = function() {
            logger.error('画像の読み込み中にエラーが発生しました');
        };
        
        reader.readAsDataURL(file);
    }
});

// ドット絵変換処理
convertBtn.addEventListener('click', function() {
    if (!originalImage) {
        logger.error('画像が選択されていません');
        return;
    }
    
    try {
        disableUI();
        logger.log('ドット絵変換を開始します...');
        
        const pixelSize = parseInt(pixelSizeSlider.value);
        const colorCount = parseInt(colorReductionSlider.value);
        
        // 非同期で処理を実行
        setTimeout(() => {
            try {
                convertToPixelArt(pixelSize, colorCount);
                enableUI();
                downloadBtn.disabled = false;
                logger.log('ドット絵変換が完了しました');
            } catch (error) {
                logger.error(`変換処理中にエラーが発生しました: ${error.message}`);
                enableUI();
            }
        }, 100);
    } catch (error) {
        logger.error(`変換処理の準備中にエラーが発生しました: ${error.message}`);
        enableUI();
    }
});

// ドット絵変換の実装
function convertToPixelArt(pixelSize, colorCount) {
    // 元の画像サイズを取得
    const width = originalImage.width;
    const height = originalImage.height;
    
    // ピクセル化後のサイズを計算
    const smallWidth = Math.floor(width / pixelSize);
    const smallHeight = Math.floor(height / pixelSize);
    
    // 一時的なキャンバスを作成
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = smallWidth;
    tempCanvas.height = smallHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    // 縮小して描画（ピクセル化の第一段階）
    tempCtx.drawImage(originalImage, 0, 0, smallWidth, smallHeight);
    
    // 縮小した画像のピクセルデータを取得
    const imageData = tempCtx.getImageData(0, 0, smallWidth, smallHeight);
    const data = imageData.data;
    
    // 色数削減処理
    if (colorCount < 256) {
        reduceColors(data, colorCount);
    }
    
    // 変更を適用
    tempCtx.putImageData(imageData, 0, 0);
    
    // ドット絵用キャンバスのサイズを設定
    pixelatedCanvas.width = smallWidth * pixelSize;
    pixelatedCanvas.height = smallHeight * pixelSize;
    
    // 最終的なドット絵を描画
    pixelatedCtx.imageSmoothingEnabled = false;
    pixelatedCtx.drawImage(tempCanvas, 0, 0, smallWidth, smallHeight, 0, 0, smallWidth * pixelSize, smallHeight * pixelSize);
}

// 色数削減処理
function reduceColors(data, colorCount) {
    // 量子化の係数を計算
    const factor = 256 / Math.ceil(Math.pow(colorCount, 1/3));
    
    for (let i = 0; i < data.length; i += 4) {
        // RGB値を量子化
        data[i] = Math.floor(data[i] / factor) * factor;
        data[i + 1] = Math.floor(data[i + 1] / factor) * factor;
        data[i + 2] = Math.floor(data[i + 2] / factor) * factor;
        // アルファ値はそのまま
    }
}

// ダウンロード処理
downloadBtn.addEventListener('click', function() {
    try {
        const link = document.createElement('a');
        link.download = 'pixel-art.png';
        link.href = pixelatedCanvas.toDataURL('image/png');
        link.click();
        logger.log('ドット絵画像をダウンロードしました');
    } catch (error) {
        logger.error(`ダウンロード中にエラーが発生しました: ${error.message}`);
    }
});

// 初期化処理
window.addEventListener('load', function() {
    logger.log('アプリケーションを初期化しています...');
    setupCrashDetection();
    logger.log('アプリケーションの準備が完了しました');
}); 