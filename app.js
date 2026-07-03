const canvas = document.getElementById('textureCanvas');
const ctx = canvas.getContext('2d');
const modelViewer = document.getElementById('f1-viewer');

const brushColor = document.getElementById('brushColor');
const brushSize = document.getElementById('brushSize');
const clearBtn = document.getElementById('clearBtn');

let isDrawing = false;

// 1. Load the exact UV map from your textures folder
const baseLivery = new Image();
baseLivery.src = 'textures/Livery_baseColor.png'; 

baseLivery.onload = () => {
    // Draw the UV map onto the canvas
    ctx.drawImage(baseLivery, 0, 0, canvas.width, canvas.height);
    // Push the initial texture to the 3D model
    applyTextureTo3DModel(); 
};

// 2. Drawing Mechanics
function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = brushColor.value;
    ctx.lineWidth = brushSize.value;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
});

// 3. Update the 3D model when you finish a brush stroke
canvas.addEventListener('mouseup', () => {
    if (isDrawing) {
        isDrawing = false;
        applyTextureTo3DModel();
    }
});

canvas.addEventListener('mouseleave', () => {
    if (isDrawing) {
        isDrawing = false;
        applyTextureTo3DModel();
    }
});

// 4. Reset Button - Clears paint and redraws the base UV map
clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseLivery, 0, 0, canvas.width, canvas.height);
    applyTextureTo3DModel();
});

// 5. The Link Engine: Push 2D Canvas to 3D Model Viewer
async function applyTextureTo3DModel() {
    if (!modelViewer.model) return; 

    // Target the first material on the model (usually the main chassis)
    // Note: If the paint applies to the tires instead of the car, change [0] to [1] or [2]
    const material = modelViewer.model.materials[0]; 
    
    if (material) {
        // Convert the current canvas state into a 3D texture
        const texture = await modelViewer.createTexture(canvas.toDataURL());
        
        // Apply it to the car
        material.pbrMetallicRoughness.baseColorTexture.setTexture(texture);
    }
}

// Ensure the texture applies as soon as the 3D model finishes loading
modelViewer.addEventListener('load', applyTextureTo3DModel);

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW setup failed:', err));
    });
}