
import { GoogleGenAI } from "@google/genai";

// --- Constants ---
const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];
const IMAGE_STYLES = [
  { name: 'None', value: '' },
  { name: 'Photographic', value: 'photorealistic, 8k, sharp focus' },
  { name: 'Cinematic', value: 'cinematic, movie still, film grain, dramatic lighting' },
  { name: 'Anime', value: 'anime style, vibrant colors, detailed illustration' },
  { name: 'Digital Art', value: 'digital art, fantasy, intricate details, epic' },
  { name: 'Low Poly', value: 'low poly, isometric, vibrant, simple shapes' },
  { name: 'Watercolor', value: 'watercolor painting, soft edges, blended colors' },
  { name: 'Cyberpunk', value: 'cyberpunk, neon lights, futuristic city, dystopian' },
  { name: 'Vintage', value: 'vintage photo, sepia tones, old-fashioned' },
];

// --- Gemini Service ---
const getAiClient = () => {
    if (!process.env.API_KEY) {
        console.warn("API_KEY environment variable not set. API calls will fail.");
        // We can't throw an error here as it would break the app on load,
        // but we can show an alert to the user when they try to generate something.
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const generateImages = async (prompt, numImages, aspectRatio) => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY is not configured. Please set it up before generating images.");
  }
  try {
    const ai = getAiClient();
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: numImages,
        outputMimeType: 'image/jpeg',
        aspectRatio: aspectRatio,
      },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("API returned no images.");
    }

    return response.generatedImages.map(img => ({
      src: `data:image/jpeg;base64,${img.image.imageBytes}`,
      prompt: prompt,
    }));
  } catch (error) {
    console.error("Error generating images:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    throw new Error(`Failed to generate images: ${errorMessage}`);
  }
};

// --- State ---
let images = [];
let generatedInBulk = [];
let isLoading = false;

// --- DOM Elements ---
const DOMElements = {
    modeSingleBtn: document.getElementById('mode-single-btn'),
    modeBulkBtn: document.getElementById('mode-bulk-btn'),
    singleGeneratorContainer: document.getElementById('single-generator-container'),
    bulkGeneratorContainer: document.getElementById('bulk-generator-container'),
    galleryContainer: document.getElementById('gallery-container'),
    
    // Single Generator
    promptInput: document.getElementById('prompt'),
    styleSelect: document.getElementById('style'),
    aspectRatioSelect: document.getElementById('aspectRatio'),
    variationsSlider: document.getElementById('variations'),
    variationsValue: document.getElementById('variations-value'),
    generateSingleBtn: document.getElementById('generate-single-btn'),
    singleErrorContainer: document.getElementById('single-error-container'),

    // Bulk Generator
    promptsBulkTextarea: document.getElementById('prompts-bulk'),
    styleBulkSelect: document.getElementById('style-bulk'),
    aspectRatioBulkSelect: document.getElementById('aspectRatio-bulk'),
    concurrencySlider: document.getElementById('concurrency'),
    concurrencyValue: document.getElementById('concurrency-value'),
    generateBulkBtn: document.getElementById('generate-bulk-btn'),
    bulkErrorContainer: document.getElementById('bulk-error-container'),
    progressContainer: document.getElementById('progress-container'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    downloadZipBtn: document.getElementById('download-zip-btn'),
};

// --- Helper Functions ---
const populateSelect = (selectElement, options, isStyle = false) => {
    options.forEach(option => {
        const optionElement = document.createElement('option');
        if (isStyle) {
            optionElement.value = option.value;
            optionElement.textContent = option.name;
        } else {
            optionElement.value = option;
            optionElement.textContent = option;
        }
        selectElement.appendChild(optionElement);
    });
};

const createIcon = (type) => {
    const icons = {
        spinner: `<svg class="animate-spin w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`,
        alert: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 mr-3"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    };
    return icons[type] || '';
};

const showError = (container, message) => {
    container.innerHTML = `${createIcon('alert')}<span>${message}</span>`;
    container.classList.remove('hidden');
    container.classList.add('flex');
};

const hideError = (container) => {
    container.classList.add('hidden');
    container.classList.remove('flex');
    container.innerHTML = '';
};

const setLoadingState = (button, loading, originalText) => {
    isLoading = loading;
    button.disabled = loading;
    if (loading) {
        button.innerHTML = createIcon('spinner');
    } else {
        button.innerHTML = originalText;
    }
};

// --- Rendering Functions ---

const renderImageGrid = () => {
    if (images.length === 0) {
        DOMElements.galleryContainer.innerHTML = `
            <div class="text-center py-16 mt-8 bg-slate-900/30 rounded-lg">
                <h3 class="text-2xl font-semibold text-slate-400">Your gallery is empty</h3>
                <p class="text-slate-500 mt-2">Start generating images to see them appear here.</p>
            </div>`;
        return;
    }

    const gridHeader = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-bold text-white">Generated Images</h2>
            <button id="clear-all-btn" class="bg-red-800/50 hover:bg-red-700 text-red-200 font-semibold py-2 px-4 rounded-full transition-colors duration-300 flex items-center text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 mr-2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                Clear All
            </button>
        </div>`;
    
    const gridContent = images.map(image => `
        <div class="group relative overflow-hidden rounded-lg shadow-lg animate-fade-in">
            <img src="${image.src}" alt="${image.prompt}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
            <div class="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-4 flex flex-col justify-end">
                <p class="text-white text-sm mb-2 line-clamp-3">${image.prompt}</p>
                <button data-src="${image.src}" data-id="${image.id}" class="download-btn mt-auto self-start bg-brand-accent hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-full transition-all duration-300 flex items-center text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> 
                    Download
                </button>
            </div>
        </div>`).join('');

    DOMElements.galleryContainer.innerHTML = `${gridHeader}<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">${gridContent}</div>`;
    
    document.getElementById('clear-all-btn').addEventListener('click', clearImages);
    document.querySelectorAll('.download-btn').forEach(btn => btn.addEventListener('click', handleDownloadSingle));
};

// --- Event Handlers ---

const handleModeChange = (mode) => {
    if (mode === 'single') {
        DOMElements.modeSingleBtn.className = 'px-4 py-2 text-sm md:text-base font-semibold rounded-full transition-all duration-300 bg-brand-accent text-white shadow-lg';
        DOMElements.modeBulkBtn.className = 'px-4 py-2 text-sm md:text-base font-semibold rounded-full transition-all duration-300 text-indigo-200 hover:bg-brand-accent/50';
        DOMElements.singleGeneratorContainer.classList.remove('hidden');
        DOMElements.bulkGeneratorContainer.classList.add('hidden');
    } else {
        DOMElements.modeBulkBtn.className = 'px-4 py-2 text-sm md:text-base font-semibold rounded-full transition-all duration-300 bg-brand-accent text-white shadow-lg';
        DOMElements.modeSingleBtn.className = 'px-4 py-2 text-sm md:text-base font-semibold rounded-full transition-all duration-300 text-indigo-200 hover:bg-brand-accent/50';
        DOMElements.bulkGeneratorContainer.classList.remove('hidden');
        DOMElements.singleGeneratorContainer.classList.add('hidden');
    }
};

const clearImages = () => {
    images = [];
    renderImageGrid();
};

const handleDownloadSingle = (e) => {
    const { src, id } = e.currentTarget.dataset;
    const link = document.createElement('a');
    link.href = src;
    link.download = `panther-ai-${id}.jpeg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const handleGenerateSingle = async () => {
    if (isLoading) return;
    const prompt = DOMElements.promptInput.value.trim();
    if (!prompt) {
        showError(DOMElements.singleErrorContainer, 'Please enter a prompt.');
        return;
    }

    const numVariations = Number(DOMElements.variationsSlider.value);
    const originalText = DOMElements.generateSingleBtn.innerHTML;
    setLoadingState(DOMElements.generateSingleBtn, true);
    hideError(DOMElements.singleErrorContainer);

    const style = DOMElements.styleSelect.value;
    const fullPrompt = `${prompt}${style ? `, ${style}` : ''}`;
    const aspectRatio = DOMElements.aspectRatioSelect.value;
    
    try {
        const newImages = await generateImages(fullPrompt, numVariations, aspectRatio);
        const imagesWithIds = newImages.map(img => ({ ...img, id: crypto.randomUUID() }));
        images = [...imagesWithIds, ...images];
        renderImageGrid();
    } catch (e) {
        showError(DOMElements.singleErrorContainer, e.message);
    } finally {
        setLoadingState(DOMElements.generateSingleBtn, false, originalText);
    }
};

const handleGenerateBulk = async () => {
    if (isLoading) return;
    const promptList = DOMElements.promptsBulkTextarea.value.split('\n').filter(p => p.trim() !== '');
    if (promptList.length === 0) {
        showError(DOMElements.bulkErrorContainer, 'Please enter at least one prompt.');
        return;
    }

    const originalText = DOMElements.generateBulkBtn.innerHTML;
    setLoadingState(DOMElements.generateBulkBtn, true);
    hideError(DOMElements.bulkErrorContainer);
    DOMElements.progressContainer.classList.remove('hidden');
    DOMElements.downloadZipBtn.classList.add('hidden');
    generatedInBulk = [];

    const total = promptList.length;
    let current = 0;
    DOMElements.progressText.textContent = `Progress: ${current} / ${total}`;
    DOMElements.progressBar.style.width = '0%';

    const concurrency = Number(DOMElements.concurrencySlider.value);
    const style = DOMElements.styleBulkSelect.value;
    const aspectRatio = DOMElements.aspectRatioBulkSelect.value;

    for (let i = 0; i < total; i += concurrency) {
        const chunk = promptList.slice(i, i + concurrency);
        try {
            const promises = chunk.map(prompt => {
                const fullPrompt = `${prompt.trim()}${style ? `, ${style}` : ''}`;
                return generateImages(fullPrompt, 1, aspectRatio);
            });
            const results = await Promise.all(promises);
            const newImages = results.flat().map(img => ({ ...img, id: crypto.randomUUID() }));
            
            images = [...newImages, ...images];
            generatedInBulk.push(...newImages);
            renderImageGrid();

            current += chunk.length;
            DOMElements.progressText.textContent = `Progress: ${current} / ${total}`;
            DOMElements.progressBar.style.width = `${(current / total) * 100}%`;
        } catch (e) {
            showError(DOMElements.bulkErrorContainer, e.message);
            setLoadingState(DOMElements.generateBulkBtn, false, originalText);
            return;
        }
    }
    
    setLoadingState(DOMElements.generateBulkBtn, false, originalText);
    DOMElements.downloadZipBtn.classList.remove('hidden');
    DOMElements.downloadZipBtn.classList.add('flex');
};

const handleDownloadZip = async () => {
    if (generatedInBulk.length === 0) return;
    const zip = new JSZip();
    
    for (let i = 0; i < generatedInBulk.length; i++) {
        const image = generatedInBulk[i];
        const response = await fetch(image.src);
        const blob = await response.blob();
        zip.file(`image_${i + 1}.jpeg`, blob);
    }
    
    zip.generateAsync({ type: 'blob' }).then((content) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'panther-ai-bulk-images.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
};

const updateBulkButtonText = () => {
    const count = DOMElements.promptsBulkTextarea.value.split('\n').filter(p => p.trim() !== '').length;
    DOMElements.generateBulkBtn.textContent = `Generate ${count} Image${count !== 1 ? 's' : ''}`;
};


// --- Initialization ---

const initialize = () => {
    // Populate dropdowns
    populateSelect(DOMElements.styleSelect, IMAGE_STYLES, true);
    populateSelect(DOMElements.aspectRatioSelect, ASPECT_RATIOS);
    populateSelect(DOMElements.styleBulkSelect, IMAGE_STYLES, true);
    populateSelect(DOMElements.aspectRatioBulkSelect, ASPECT_RATIOS);
    
    // Initial render
    renderImageGrid();
    updateBulkButtonText();

    // Attach event listeners
    DOMElements.modeSingleBtn.addEventListener('click', () => handleModeChange('single'));
    DOMElements.modeBulkBtn.addEventListener('click', () => handleModeChange('bulk'));
    
    // Single generator listeners
    DOMElements.variationsSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        DOMElements.variationsValue.textContent = value;
        DOMElements.generateSingleBtn.textContent = `Generate ${value} Image${value > 1 ? 's' : ''}`;
    });
    DOMElements.generateSingleBtn.addEventListener('click', handleGenerateSingle);

    // Bulk generator listeners
    DOMElements.concurrencySlider.addEventListener('input', (e) => {
        DOMElements.concurrencyValue.textContent = e.target.value;
    });
    DOMElements.promptsBulkTextarea.addEventListener('input', updateBulkButtonText);
    DOMElements.generateBulkBtn.addEventListener('click', handleGenerateBulk);
    DOMElements.downloadZipBtn.addEventListener('click', handleDownloadZip);
};

// --- App Start ---
document.addEventListener('DOMContentLoaded', initialize);
