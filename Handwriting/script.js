// Uygulama durumu
const state = {
    currentImage: null,
    cameraStream: null,
    isProcessing: false,
    worker: null,
    recognizedText: '',
    isEditing: false,
    originalText: ''
};

// DOM elementleri
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const previewImage = document.getElementById('previewImage');
const noPreview = document.getElementById('noPreview');
const processBtn = document.getElementById('processBtn');
const startCameraBtn = document.getElementById('startCamera');
const captureBtn = document.getElementById('captureBtn');
const cameraPreview = document.getElementById('cameraPreview');
const captureCanvas = document.getElementById('captureCanvas');
const resultsDiv = document.getElementById('results');
const copyTextBtn = document.getElementById('copyText');
const clearAllBtn = document.getElementById('clearAll');
const speakTextBtn = document.getElementById('speakText');
const downloadTextBtn = document.getElementById('downloadText');
const confidenceValue = document.getElementById('confidenceValue');
const confidenceFill = document.getElementById('confidenceFill');
const enhanceContrast = document.getElementById('enhanceContrast');
const preprocessImage = document.getElementById('preprocessImage');
const languageSelect = document.getElementById('languageSelect');
const progressText = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const editToggle = document.getElementById('editToggle');
const editActions = document.getElementById('editActions');
const saveEdit = document.getElementById('saveEdit');
const cancelEdit = document.getElementById('cancelEdit');

// Tesseract worker'ı başlat
async function initializeTesseract() {
    try {
        showStatus('Tesseract.js yükleniyor...', 'info');

        // Worker oluştur
        state.worker = await Tesseract.createWorker({
            logger: progress => updateProgress(progress),
            errorHandler: err => console.error('Tesseract error:', err)
        });

        // Türkçe dilini yükle
        await state.worker.loadLanguage('tur');
        await state.worker.initialize('tur');

        showStatus('Tesseract.js başarıyla yüklendi!', 'success');

    } catch (error) {
        console.error('Tesseract initialization error:', error);
        showStatus('Tesseract yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

// İlerleme durumunu güncelle
function updateProgress(progress) {
    const status = progress.status;
    const percent = progress.progress * 100;

    progressText.textContent = `${status}... (%${Math.round(percent)})`;
    progressFill.style.width = `${percent}%`;

    if (status === 'recognizing text') {
        progressFill.style.background = 'linear-gradient(90deg, #4cc9f0, #4361ee)';
    } else if (status === 'done') {
        progressFill.style.background = '#28a745';
    }
}

// Görüntü ön işleme
function preprocessImageData(imageElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Canvas boyutlarını ayarla
    const maxSize = 2000;
    let width = imageElement.naturalWidth || imageElement.width;
    let height = imageElement.naturalHeight || imageElement.height;

    // Çok büyük resimleri küçült
    if (width > maxSize || height > maxSize) {
        if (width > height) {
            height = (height * maxSize) / width;
            width = maxSize;
        } else {
            width = (width * maxSize) / height;
            height = maxSize;
        }
    }

    canvas.width = width;
    canvas.height = height;

    // Orijinal görüntüyü çiz
    ctx.drawImage(imageElement, 0, 0, width, height);

    // Kontrast iyileştirme
    if (enhanceContrast.checked) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Gri tonlama ve kontrast artırma
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Gri tonlama
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Kontrast artırma
            const contrast = 1.5; // Kontrast faktörü
            const adjusted = (gray - 128) * contrast + 128;

            data[i] = adjusted;     // R
            data[i + 1] = adjusted; // G
            data[i + 2] = adjusted; // B
        }

        ctx.putImageData(imageData, 0, 0);
    }

    return canvas;
}

// Metin tanıma
async function recognizeText(imageElement) {
    if (!state.worker || state.isProcessing) return;

    state.isProcessing = true;
    updateProcessButton(true);

    try {
        showStatus('Metin tanıma başlatıldı...', 'info');

        let processedImage = imageElement;

        // Görüntü ön işleme
        if (preprocessImage.checked) {
            processedImage = preprocessImageData(imageElement);
        }

        // Seçilen dili ayarla
        const language = languageSelect.value;
        await state.worker.loadLanguage(language);
        await state.worker.initialize(language);

        // OCR işlemi
        const { data: { text, confidence } } = await state.worker.recognize(processedImage, {
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzĞÜŞİÖÇğüşıöç0123456789 .,!?;:-()[]{}"\''
        });

        // Sonuçları göster
        state.recognizedText = text;
        displayResults(text, confidence);
        showStatus('Metin başarıyla tanındı!', 'success');

    } catch (error) {
        console.error('Metin tanıma hatası:', error);
        showStatus('Metin tanınırken hata oluştu: ' + error.message, 'error');
        displayError('Tanıma sırasında hata oluştu: ' + error.message);
    } finally {
        state.isProcessing = false;
        updateProcessButton(false);
        progressFill.style.width = '0%';
        progressText.textContent = 'Hazır';
    }
}

// Sonuçları göster
function displayResults(text, confidence) {
    const cleanedText = cleanText(text);

    resultsDiv.innerHTML = `
        <div class="recognized-text">${cleanedText}</div>
    `;

    // Butonları etkinleştir
    copyTextBtn.disabled = false;
    speakTextBtn.disabled = false;
    downloadTextBtn.disabled = false;
    editToggle.disabled = false;

    // Güven skorunu güncelle
    updateConfidence(confidence);
}

// Düzenleme modunu aç/kapat
function toggleEditMode() {
    if (state.isEditing) {
        cancelEditing();
    } else {
        startEditing();
    }
}

// Düzenleme modunu başlat
function startEditing() {
    if (!state.recognizedText) return;

    state.isEditing = true;
    state.originalText = state.recognizedText;

    // UI'ı güncelle
    editToggle.innerHTML = '<span class="edit-icon">🔒</span><span class="edit-text">Düzenleme Modu</span>';
    editToggle.style.background = '#dc3545';
    editActions.style.display = 'flex';
    resultsDiv.classList.add('editable');

    // Textarea oluştur
    const currentText = resultsDiv.querySelector('.recognized-text').textContent;
    resultsDiv.innerHTML = `
        <textarea id="textEditor">${currentText}</textarea>
        <div class="edit-notice">Metni düzenleyebilirsiniz. Bitince "Kaydet" veya "İptal" butonlarını kullanın.</div>
    `;

    // Textarea'ya odaklan
    const textEditor = document.getElementById('textEditor');
    textEditor.focus();
    textEditor.setSelectionRange(0, 0);

    showStatus('Düzenleme modu aktif. Metni değiştirebilirsiniz.', 'info');
}

// Düzenlemeyi kaydet
function saveEditing() {
    const textEditor = document.getElementById('textEditor');
    const newText = textEditor.value.trim();

    if (newText === '') {
        showStatus('Metin boş olamaz!', 'error');
        return;
    }

    state.recognizedText = newText;
    state.isEditing = false;

    // UI'ı güncelle
    updateUIAfterEdit();

    // Güncellenmiş metni göster
    resultsDiv.innerHTML = `<div class="recognized-text">${newText}</div>`;

    showStatus('Metin başarıyla güncellendi!', 'success');
}

// Düzenlemeyi iptal et
function cancelEditing() {
    state.isEditing = false;
    state.recognizedText = state.originalText;

    // UI'ı güncelle
    updateUIAfterEdit();

    // Orijinal metni göster
    resultsDiv.innerHTML = `<div class="recognized-text">${state.originalText}</div>`;

    showStatus('Düzenleme iptal edildi.', 'info');
}

// Düzenleme sonrası UI güncelleme
function updateUIAfterEdit() {
    editToggle.innerHTML = '<span class="edit-icon">✏️</span><span class="edit-text">Düzenle</span>';
    editToggle.style.background = 'var(--edit-color)';
    editActions.style.display = 'none';
    resultsDiv.classList.remove('editable');
}

// Metni temizle
function cleanText(text) {
    return text
        .replace(/\n\s*\n/g, '\n') // Fazla boş satırları temizle
        .replace(/\s+/g, ' ')      // Fazla boşlukları temizle
        .trim();
}

// Güven skorunu güncelle
function updateConfidence(score) {
    const roundedScore = Math.round(score);
    confidenceValue.textContent = `${roundedScore}%`;
    confidenceFill.style.width = `${roundedScore}%`;

    // Renk güncelleme
    if (roundedScore >= 80) {
        confidenceFill.style.background = 'linear-gradient(90deg, #4ecdc4, #45b7d1)';
    } else if (roundedScore >= 60) {
        confidenceFill.style.background = 'linear-gradient(90deg, #ffd166, #4ecdc4)';
    } else {
        confidenceFill.style.background = 'linear-gradient(90deg, #ff6b6b, #ffd166)';
    }
}

// Hata göster
function displayError(message) {
    resultsDiv.innerHTML = `
        <div class="error-message">${message}</div>
    `;
    updateConfidence(0);
    copyTextBtn.disabled = true;
    speakTextBtn.disabled = true;
    downloadTextBtn.disabled = true;
    editToggle.disabled = true;
}

// UI güncelleme
function updateUI() {
    const hasImage = state.currentImage !== null;
    processBtn.disabled = !hasImage || state.isProcessing;
}

// İşlem butonunu güncelle
function updateProcessButton(isProcessing) {
    const btnText = processBtn.querySelector('.btn-text');
    const btnLoading = processBtn.querySelector('.btn-loading');

    if (isProcessing) {
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        processBtn.disabled = true;
    } else {
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        updateUI();
    }
}

// Kamera başlatma
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'environment'
            }
        });

        cameraPreview.srcObject = stream;
        cameraPreview.style.display = 'block';
        state.cameraStream = stream;

        startCameraBtn.disabled = true;
        captureBtn.disabled = false;

        showStatus('Kamera başlatıldı', 'success');
    } catch (error) {
        console.error('Kamera hatası:', error);
        showStatus('Kamera başlatılamadı: ' + error.message, 'error');
    }
}

// Fotoğraf çekme
function capturePhoto() {
    const context = captureCanvas.getContext('2d');
    captureCanvas.width = cameraPreview.videoWidth;
    captureCanvas.height = cameraPreview.videoHeight;

    context.drawImage(cameraPreview, 0, 0);

    // Canvas'tan resim oluştur
    const imageUrl = captureCanvas.toDataURL('image/jpeg', 0.9);
    loadImageFromUrl(imageUrl);

    // Kamerayı kapat
    stopCamera();
}

// Kamerayı durdur
function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
        state.cameraStream = null;
    }

    cameraPreview.style.display = 'none';
    startCameraBtn.disabled = false;
    captureBtn.disabled = true;
}

// Resim yükleme
function loadImageFromFile(file) {
    if (!file.type.startsWith('image/')) {
        showStatus('Lütfen geçerli bir resim dosyası seçin.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => loadImageFromUrl(e.target.result);
    reader.readAsDataURL(file);
}

function loadImageFromUrl(url) {
    const img = new Image();
    img.onload = () => {
        previewImage.src = url;
        previewImage.style.display = 'block';
        noPreview.style.display = 'none';
        state.currentImage = img;
        updateUI();
        showStatus('Resim yüklendi', 'success');
    };
    img.onerror = () => {
        showStatus('Resim yüklenirken hata oluştu', 'error');
    };
    img.src = url;
}

// Metni kopyalama
function copyToClipboard() {
    let text = '';

    if (state.isEditing) {
        const textEditor = document.getElementById('textEditor');
        text = textEditor.value;
    } else {
        text = resultsDiv.querySelector('.recognized-text')?.textContent || state.recognizedText;
    }

    if (text) {
        navigator.clipboard.writeText(text).then(() => {
            showStatus('Metin panoya kopyalandı!', 'success');
        }).catch(err => {
            console.error('Kopyalama hatası:', err);
            showStatus('Kopyalama başarısız', 'error');
        });
    }
}

// Metni seslendirme
function speakText() {
    let text = '';

    if (state.isEditing) {
        const textEditor = document.getElementById('textEditor');
        text = textEditor.value;
    } else {
        text = resultsDiv.querySelector('.recognized-text')?.textContent || state.recognizedText;
    }

    if (text && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = languageSelect.value === 'tur' ? 'tr-TR' : 'en-US';
        utterance.rate = 0.8;
        window.speechSynthesis.speak(utterance);
        showStatus('Metin seslendiriliyor...', 'info');
    } else {
        showStatus('Seslendirme desteklenmiyor', 'error');
    }
}

// Metni indirme
function downloadText() {
    let text = '';

    if (state.isEditing) {
        const textEditor = document.getElementById('textEditor');
        text = textEditor.value;
    } else {
        text = resultsDiv.querySelector('.recognized-text')?.textContent || state.recognizedText;
    }

    if (text) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'taninan_metin.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showStatus('Metin indirildi!', 'success');
    }
}

// Her şeyi temizle
function clearAll() {
    // Düzenleme modundaysa çık
    if (state.isEditing) {
        cancelEditing();
    }

    // Resmi temizle
    previewImage.src = '';
    previewImage.style.display = 'none';
    noPreview.style.display = 'flex';
    state.currentImage = null;
    state.recognizedText = '';
    state.originalText = '';

    // Sonuçları temizle
    resultsDiv.innerHTML = `
        <div class="placeholder">
            <span>📝</span>
            <p>Tanınan metin burada görünecek</p>
        </div>
    `;

    // Butonları devre dışı bırak
    copyTextBtn.disabled = true;
    speakTextBtn.disabled = true;
    downloadTextBtn.disabled = true;
    editToggle.disabled = true;

    // Düzenleme kontrollerini gizle
    editActions.style.display = 'none';
    resultsDiv.classList.remove('editable');
    editToggle.innerHTML = '<span class="edit-icon">✏️</span><span class="edit-text">Düzenle</span>';
    editToggle.style.background = 'var(--edit-color)';

    // Güven skorunu sıfırla
    updateConfidence(0);

    // İlerleme çubuğunu sıfırla
    progressFill.style.width = '0%';
    progressText.textContent = 'Hazır';

    // Kamerayı durdur
    stopCamera();

    // UI'ı güncelle
    updateUI();

    showStatus('Tüm içerik temizlendi', 'info');
}

// Durum mesajı göster
function showStatus(message, type = 'info') {
    // Mevcut durum mesajlarını temizle
    const existingStatus = document.querySelector('.status-message');
    if (existingStatus) {
        existingStatus.remove();
    }

    // Yeni durum mesajı oluştur
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message status-${type}`;
    statusDiv.textContent = message;

    // Container'a ekle
    document.querySelector('.container').appendChild(statusDiv);

    // 5 saniye sonra kaldır
    setTimeout(() => {
        if (statusDiv.parentNode) {
            statusDiv.remove();
        }
    }, 5000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Tesseract'ı başlat
    await initializeTesseract();

    // Bildirim izni iste
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});

// Dosya yükleme
imageInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        loadImageFromFile(e.target.files[0]);
    }
});

// Sürükle bırak
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--primary-color)';
    uploadArea.style.background = '#f8f9ff';
});

uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#dee2e6';
    uploadArea.style.background = '';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#dee2e6';
    uploadArea.style.background = '';

    if (e.dataTransfer.files.length > 0) {
        loadImageFromFile(e.dataTransfer.files[0]);
    }
});

// Buton eventleri
processBtn.addEventListener('click', () => {
    if (state.currentImage) {
        recognizeText(state.currentImage);
    }
});

editToggle.addEventListener('click', toggleEditMode);
saveEdit.addEventListener('click', saveEditing);
cancelEdit.addEventListener('click', cancelEditing);
startCameraBtn.addEventListener('click', startCamera);
captureBtn.addEventListener('click', capturePhoto);
copyTextBtn.addEventListener('click', copyToClipboard);
speakTextBtn.addEventListener('click', speakText);
downloadTextBtn.addEventListener('click', downloadText);
clearAllBtn.addEventListener('click', clearAll);

// Sayfadan çıkarken worker'ı temizle
window.addEventListener('beforeunload', () => {
    if (state.worker) {
        state.worker.terminate();
    }
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
    }
});