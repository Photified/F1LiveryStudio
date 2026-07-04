// --- 1. Scene, Camera, & Renderer ---
const container = document.getElementById('viewport3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#050505'); // Pitch black studio void

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
renderer.outputEncoding = THREE.sRGBEncoding; 
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1; // Boosted to make car paint pop in the dark studio

container.appendChild(renderer.domElement);

// Load Studio Paint Booth Environment Reflections
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new THREE.RoomEnvironment(), 0.04).texture;

// Moody Ambient Light
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

// Dramatic Studio Top Light
const topLight = new THREE.DirectionalLight(0xffffff, 1.5);
topLight.castShadow = true;
topLight.shadow.mapSize.width = 2048;
topLight.shadow.mapSize.height = 2048;
topLight.shadow.camera.near = 0.5;
topLight.shadow.camera.far = 40;
topLight.shadow.camera.left = -20;
topLight.shadow.camera.right = 20;
topLight.shadow.camera.top = 20;
topLight.shadow.camera.bottom = -20;
topLight.shadow.bias = -0.0001;
scene.add(topLight);

// --- PROCEDURAL MOODY BOOTH TEXTURES ---

function generateCementTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // Base dark grey cement
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Noise particles for concrete grain
    for (let i = 0; i < 150000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
        ctx.fillRect(Math.random() * 1024, Math.random() * 1024, Math.random() * 2, Math.random() * 2);
    }
    
    // Heavy Spotlight Vignette (Fades to pitch black at edges)
    const rGrad = ctx.createRadialGradient(512, 512, 120, 512, 512, 512);
    rGrad.addColorStop(0, 'rgba(0,0,0,0)');
    rGrad.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = rGrad;
    ctx.fillRect(0, 0, 1024, 1024);
    
    return new THREE.CanvasTexture(canvas);
}

function generateWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Base almost-black wall
    ctx.fillStyle = '#0a0a0a'; 
    ctx.fillRect(0, 0, 512, 512);
    
    // Vertical shadow gradient
    const vGrad = ctx.createLinearGradient(0, 0, 0, 512);
    vGrad.addColorStop(0, 'rgba(0,0,0,1.0)'); 
    vGrad.addColorStop(0.2, 'rgba(0,0,0,0)');
    vGrad.addColorStop(0.8, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, 'rgba(0,0,0,1.0)'); 
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, 512, 512);
    
    // Horizontal shadow gradient
    const hGrad = ctx.createLinearGradient(0, 0, 512, 0);
    hGrad.addColorStop(0, 'rgba(0,0,0,1.0)'); 
    hGrad.addColorStop(0.2, 'rgba(0,0,0,0)');
    hGrad.addColorStop(0.8, 'rgba(0,0,0,0)');
    hGrad.addColorStop(1, 'rgba(0,0,0,1.0)'); 
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, 512, 512);
    
    return new THREE.CanvasTexture(canvas);
}

// Setup the Square Cement Floor Pedestal
const floorGeo = new THREE.BoxGeometry(80, 0.5, 80); 
const floorMat = new THREE.MeshStandardMaterial({ 
    color: 0x888888, 
    map: generateCementTexture(),
    roughness: 0.8, 
    metalness: 0.2 
});
const studioFloor = new THREE.Mesh(floorGeo, floorMat);
studioFloor.receiveShadow = true;
studioFloor.visible = false; 
scene.add(studioFloor);

// Setup the Room/Paint Booth
const boothGeo = new THREE.BoxGeometry(80, 40, 80); 
const boothMat = new THREE.MeshStandardMaterial({
    color: 0x222222, 
    map: generateWallTexture(),
    side: THREE.DoubleSide, 
    roughness: 1.0,
    metalness: 0.0
});
const paintBooth = new THREE.Mesh(boothGeo, boothMat);
paintBooth.receiveShadow = true;
paintBooth.visible = false;
scene.add(paintBooth);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 35; // Keeps user inside the room

// Rock-solid angle lock prevents camera from EVER going under the floor
controls.maxPolarAngle = Math.PI / 2 - 0.02; 

let activeCamView = 'iso'; 

function getCamDist() { return window.innerWidth < 650 ? 25 : 10; }

let globalTargetY = 0; // Dynamic target height based on car placement

function updateCameraTo(view) {
    activeCamView = view;
    const d = getCamDist();
    
    let tZ = 0;
    let cZ = 0;
    
    if (view === 'top' && window.innerWidth < 650) {
        tZ = 5.0;
        cZ = 5.0;
    }
    
    const views = {
        side: new THREE.Vector3(sideToggleRight ? d : -d, globalTargetY + 0.5, 0),
        front: new THREE.Vector3(0, globalTargetY + 1.0, d),
        back: new THREE.Vector3(0, globalTargetY + 1.0, -d),
        top: new THREE.Vector3(0, globalTargetY + d * 1.8, cZ),
        iso: new THREE.Vector3(-d*0.7, globalTargetY + 2.0, d*0.7) 
    };
    
    if (views[view]) {
        camera.position.copy(views[view]);
        camera.lookAt(0, globalTargetY, tZ);
        controls.target.set(0, globalTargetY, tZ);
        controls.update();
    }
}

// --- 2. Advanced Layer Stacking Framework ---
const mainDecalGroup = new THREE.Group();
const ghostDecalGroup = new THREE.Group(); 
scene.add(mainDecalGroup);
scene.add(ghostDecalGroup);

let globalRenderOrder = 1; 
let stampHistory = []; 
const actionHistory = []; 

const paintCanvas = document.createElement('canvas');
paintCanvas.width = 2048; paintCanvas.height = 2048;
const pCtx = paintCanvas.getContext('2d');
const canvasTexture = new THREE.CanvasTexture(paintCanvas);
canvasTexture.flipY = false;
canvasTexture.encoding = THREE.sRGBEncoding; 
let textureNeedsGPUUpdate = false; 

function resetToTextureDefaults() {
    pCtx.clearRect(0, 0, 2048, 2048);
    textureNeedsGPUUpdate = true;
}
resetToTextureDefaults();

function saveCanvasState() {
    if (actionHistory.length > 15) actionHistory.shift();
    actionHistory.push({ type: 'canvas', data: pCtx.getImageData(0, 0, 2048, 2048) });
}

// --- Toast Helper Logic ---
let toastTimeout;
function showToast(message, duration = 3000) {
    const toast = document.getElementById('step-toast');
    toast.innerText = message;
    toast.classList.add('visible');
    
    clearTimeout(toastTimeout);
    if (duration > 0) {
        toastTimeout = setTimeout(() => {
            toast.classList.remove('visible');
        }, duration);
    }
}

// Enable Mouse-Wheel Scrolling for Horizontal menus
document.getElementById('decal-visual-picker').addEventListener('wheel', (evt) => {
    evt.preventDefault();
    document.getElementById('decal-visual-picker').scrollLeft += evt.deltaY;
});

// --- 3. UI, State, & Handlers ---
let currentMode = 'camera'; 
let activeShape = 'circle'; 
let activeSize = 3; 
let activeDecalType = 'gradient-streak';
let isPainting = false;
let isPlacingDecal = false; 
let paintableMeshes = []; 
let currentColor = '#e10600'; 
let liveDecalHitData = null;

const ui = {
    brush: document.getElementById('mode-brush'),
    bucket: document.getElementById('mode-bucket'),
    decal: document.getElementById('mode-decal'),
    brushWrap: document.getElementById('brush-presets-wrap'),
    decalWrap: document.getElementById('decal-select-wrap'),
    decalRot: document.getElementById('decalRot'),
    decalSize: document.getElementById('toolSize'),
    commitDecalBtn: document.getElementById('commitDecalBtn'),
    undoBtn: document.getElementById('undoBtn'),
    resetBtn: document.getElementById('resetBtn'),
    helpBtn: document.getElementById('helpBtn'),
    helpModal: document.getElementById('helpModal'),
    closeHelpBtn: document.getElementById('closeHelpBtn'),
    installAppBtn: document.getElementById('installAppBtn'),
    openMixerBtn: document.getElementById('openMixerBtn'),
    customColorModal: document.getElementById('customColorModal'),
    liveColorPreview: document.getElementById('liveColorPreview'),
    hueSlider: document.getElementById('hueSlider'),
    satSlider: document.getElementById('satSlider'),
    litSlider: document.getElementById('litSlider'),
    cancelColorBtn: document.getElementById('cancelColorBtn'),
    applyColorBtn: document.getElementById('applyColorBtn')
};

function setMode(mode) {
    currentMode = mode;
    ['brush', 'bucket', 'decal'].forEach(m => ui[m]?.classList.remove('active'));
    if (ui[mode]) ui[mode].classList.add('active');
    
    ui.brushWrap.style.display = (mode === 'brush') ? 'flex' : 'none';
    ui.decalWrap.style.display = (mode === 'decal') ? 'flex' : 'none';
    
    clearGhosts();
    controls.enabled = (mode !== 'brush'); 
    
    if (mode === 'brush') showToast('Brush Mode: Draw directly on the car', 3000);
    else if (mode === 'bucket') showToast('Bucket Mode: Click a part to fill it', 3000);
    else if (mode === 'decal') showToast('Step 1: Click on the car to place a Decal', 0);

    if (mode === 'decal') {
        setTimeout(() => {
            const hit = getIntersection(window.innerWidth / 2, window.innerHeight / 2);
            if (hit) {
                liveDecalHitData = { point: hit.point.clone(), normal: hit.face.normal.clone() };
                refreshLivePreview();
            }
        }, 50);
    } else {
        liveDecalHitData = null;
    }
}

ui.helpBtn.addEventListener('click', () => ui.helpModal.style.display = 'flex');
ui.closeHelpBtn.addEventListener('click', () => ui.helpModal.style.display = 'none');

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    ui.installAppBtn.style.display = 'block';
});
ui.installAppBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') deferredPrompt = null;
    }
});

ui.brush.addEventListener('click', () => setMode('brush'));
ui.bucket.addEventListener('click', () => setMode('bucket'));
ui.decal.addEventListener('click', () => setMode('decal'));

// Decal Type Picker Logic
document.querySelectorAll('.decal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.decal-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeDecalType = e.target.getAttribute('data-shape');
        updateLiveDecalPreview();
        if(currentMode === 'decal' && !liveDecalHitData) {
            showToast('Click anywhere on the car to place the Decal', 0);
        }
    });
});

// Custom Color Mixer Logic
let tempColor = '#e10600'; 
function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function updateMixerPreview() {
    const h = ui.hueSlider.value;
    const s = ui.satSlider.value;
    const l = ui.litSlider.value;
    tempColor = hslToHex(h, s, l);
    ui.liveColorPreview.style.background = tempColor;
}
ui.hueSlider.addEventListener('input', updateMixerPreview);
ui.satSlider.addEventListener('input', updateMixerPreview);
ui.litSlider.addEventListener('input', updateMixerPreview);

ui.openMixerBtn.addEventListener('click', () => ui.customColorModal.style.display = 'flex');
ui.cancelColorBtn.addEventListener('click', () => ui.customColorModal.style.display = 'none');

ui.applyColorBtn.addEventListener('click', () => {
    currentColor = tempColor;
    ui.openMixerBtn.style.background = currentColor; 
    ui.customColorModal.style.display = 'none';
    if (currentMode === 'decal') updateLiveDecalPreview();
    generateVisualDecalButtons(); 
});
ui.openMixerBtn.style.background = currentColor;

document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeSize = parseInt(e.target.getAttribute('data-size'));
        activeShape = e.target.classList.contains('circle-size') ? 'circle' : 'square';
    });
});

let sideToggleRight = true;
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        const view = e.target.getAttribute('data-cam');
        if (view === 'side' && activeCamView === 'side') sideToggleRight = !sideToggleRight; 
        
        updateCameraTo(view);
        
        const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const promptMessage = isMobile 
            ? 'Pinch and drag to free-cam!' 
            : 'Scroll and drag to free-cam!';
            
        showToast(promptMessage, 4000);
    });
});

const updateLiveDecalPreview = () => {
    if (currentMode === 'decal' && liveDecalHitData) {
        clearGhosts();
        refreshLivePreview();
    }
};
ui.decalSize.addEventListener('input', updateLiveDecalPreview);
ui.decalRot.addEventListener('input', updateLiveDecalPreview);


// --- 4. Geometry and Texture Generators ---
function drawShape(ctx, x, y, size, type, color) {
    ctx.save(); 
    ctx.translate(x, y);

    let r = 0, g = 0, b = 0;
    if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        r = parseInt(hex.substring(0,2), 16);
        g = parseInt(hex.substring(2,4), 16);
        b = parseInt(hex.substring(4,6), 16);
    }
    const solidColor = `rgba(${r},${g},${b},1)`;
    const clearColor = `rgba(${r},${g},${b},0)`;

    if (type === 'gradient-streak') {
        const grad = ctx.createLinearGradient(-size, 0, size, 0);
        grad.addColorStop(0, solidColor);
        grad.addColorStop(1, clearColor);
        ctx.fillStyle = grad;
        ctx.fillRect(-size, -size/3, size*2, size/1.5);
    }
    else if (type === 'flow-tri') {
        const grad = ctx.createLinearGradient(-size, 0, size, 0);
        grad.addColorStop(0, solidColor);
        grad.addColorStop(1, clearColor);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-size, size/2.5);
        ctx.lineTo(size, 0);
        ctx.lineTo(-size, -size/2.5);
        ctx.closePath();
        ctx.fill();
    }
    else if (type === 'fade-dots-flow') {
        ctx.fillStyle = solidColor;
        for (let i = 0; i < 7; i++) {
            ctx.globalAlpha = Math.max(0, 1 - (i * 0.14)); 
            const px = -size * 0.8 + (i * size * 0.28);
            const rCircle = size * 0.25 * (1 - i * 0.08); 
            ctx.beginPath(); 
            ctx.arc(px, 0, rCircle, 0, Math.PI*2); 
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    }
    else if (type === 'aero-wing') {
        const grad = ctx.createLinearGradient(-size, 0, size, 0);
        grad.addColorStop(0, clearColor);
        grad.addColorStop(0.3, solidColor);
        grad.addColorStop(1, clearColor);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-size, size/1.5);
        ctx.quadraticCurveTo(0, -size/2, size, -size/4);
        ctx.quadraticCurveTo(0, 0, -size, size/1.5);
        ctx.fill();
    }
    else if (type === 'blade-fade') {
        const grad = ctx.createLinearGradient(-size, 0, size, 0);
        grad.addColorStop(0, solidColor);
        grad.addColorStop(1, clearColor);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-size, size/3);
        ctx.lineTo(size, -size/6);
        ctx.lineTo(-size, -size/3);
        ctx.fill();
    }
    else if (type === 'solid-stripe') {
        ctx.fillStyle = solidColor;
        ctx.fillRect(-size/2, -size*2, size, size*4);
    } 
    else if (type === 'racing-stripes') {
        ctx.fillStyle = solidColor;
        ctx.fillRect(-size/2, -size*2, size*0.35, size*4);
        ctx.fillRect(size*0.15, -size*2, size*0.35, size*4);
    }
    else if (type === 'fade-stripe') {
        const grad = ctx.createLinearGradient(0, -size*2, 0, size*2);
        grad.addColorStop(0, solidColor);
        grad.addColorStop(1, clearColor);
        ctx.fillStyle = grad;
        ctx.fillRect(-size/2, -size*2, size, size*4);
    } 
    else if (type === 'chevron-sharp') {
        ctx.fillStyle = solidColor;
        ctx.beginPath(); 
        ctx.moveTo(-size/2, -size); 
        ctx.lineTo(size/2, 0); 
        ctx.lineTo(-size/2, size); 
        ctx.lineTo(-size/4, 0); 
        ctx.closePath(); 
        ctx.fill();
    } 
    else if (type === 'chevron-fade') {
        const grad = ctx.createLinearGradient(-size/2, 0, size/2, 0);
        grad.addColorStop(0, clearColor);
        grad.addColorStop(1, solidColor);
        ctx.fillStyle = grad;
        ctx.beginPath(); 
        ctx.moveTo(-size/2, -size); 
        ctx.lineTo(size/2, 0); 
        ctx.lineTo(-size/2, size); 
        ctx.lineTo(-size/4, 0); 
        ctx.closePath(); 
        ctx.fill();
    }
    else if (type === 'speed-curve') {
        ctx.fillStyle = solidColor;
        ctx.beginPath(); 
        ctx.moveTo(-size, size/2); 
        ctx.quadraticCurveTo(0, -size, size, -size/2); 
        ctx.quadraticCurveTo(size/2, -size/4, -size, size/2); 
        ctx.closePath(); 
        ctx.fill();
    }
    else if (type === 'swoosh-fade') {
        const grad = ctx.createLinearGradient(-size, 0, size, 0);
        grad.addColorStop(0, clearColor);
        grad.addColorStop(1, solidColor);
        ctx.fillStyle = grad;
        ctx.beginPath(); 
        ctx.moveTo(-size, size/2); 
        ctx.quadraticCurveTo(0, -size, size, -size/2); 
        ctx.quadraticCurveTo(size/2, -size/4, -size, size/2); 
        ctx.closePath(); 
        ctx.fill();
    } 
    else if (type === 'slash-angles') {
        ctx.fillStyle = solidColor;
        for (let i = 0; i < 3; i++) {
            let offset = i * (size * 0.4);
            ctx.beginPath();
            ctx.moveTo(-size/2 + offset, -size + offset);
            ctx.lineTo(-size/4 + offset, -size + offset);
            ctx.lineTo(-size/1.5 + offset, size + offset);
            ctx.lineTo(-size + offset + size/12, size + offset);
            ctx.closePath();
            ctx.fill();
        }
    }
    else if (type === 'speed-lines') {
        ctx.fillStyle = solidColor;
        ctx.fillRect(-size, -size/2, size*2, size/8);
        ctx.fillRect(-size*0.8, -size/4, size*1.8, size/12);
        ctx.fillRect(-size*0.6, 0, size*1.6, size/16);
    }
    else if (type === 'wedge') {
        ctx.fillStyle = solidColor;
        ctx.beginPath();
        ctx.moveTo(-size, -size);
        ctx.lineTo(size, size);
        ctx.lineTo(-size, size);
        ctx.closePath();
        ctx.fill();
    }
    else if (type === 'triangle-fade') {
        const grad = ctx.createLinearGradient(0, -size, 0, size);
        grad.addColorStop(0, solidColor);
        grad.addColorStop(1, clearColor);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size, size);
        ctx.lineTo(-size, size);
        ctx.closePath();
        ctx.fill();
    }
    else if (type === 'flare') {
        const grad = ctx.createLinearGradient(-size, 0, size, 0);
        grad.addColorStop(0, clearColor);
        grad.addColorStop(0.5, solidColor);
        grad.addColorStop(1, clearColor);
        ctx.fillStyle = grad;
        ctx.fillRect(-size, -size/4, size*2, size/2);
    }
    else if (type === 'gradient-block') {
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
        grad.addColorStop(0, solidColor);
        grad.addColorStop(1, clearColor);
        ctx.fillStyle = grad;
        ctx.fillRect(-size, -size, size*2, size*2);
    }
    else if (type === 'grunge') {
        ctx.fillStyle = solidColor;
        for (let i = 0; i < 80; i++) {
            const px = (Math.random() - 0.5) * size * 2;
            const py = (Math.random() - 0.5) * size * 2;
            const r = Math.random() * size * 0.15;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    else if (type === 'camo') {
        ctx.fillStyle = solidColor;
        for (let i = 0; i < 20; i++) {
            const px = (Math.random() - 0.5) * size * 1.8;
            const py = (Math.random() - 0.5) * size * 1.8;
            ctx.beginPath();
            ctx.ellipse(px, py, (Math.random() * 0.4 + 0.2) * size, (Math.random() * 0.2 + 0.1) * size, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    else if (type === 'grid') {
        ctx.strokeStyle = solidColor;
        ctx.lineWidth = size * 0.08;
        for (let i = -size; i <= size; i += size * 0.4) {
            ctx.beginPath(); ctx.moveTo(i, -size); ctx.lineTo(i, size); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-size, i); ctx.lineTo(size, i); ctx.stroke();
        }
    }
    else if (type === 'tech-lines') {
        ctx.strokeStyle = solidColor;
        ctx.lineWidth = size * 0.08;
        ctx.lineJoin = 'bevel';
        ctx.beginPath();
        ctx.moveTo(-size, 0); 
        ctx.lineTo(-size*0.4, 0); 
        ctx.lineTo(-size*0.1, -size*0.4); 
        ctx.lineTo(size*0.3, -size*0.4); 
        ctx.lineTo(size*0.6, 0); 
        ctx.lineTo(size, 0);
        ctx.moveTo(-size*0.3, size*0.5); 
        ctx.lineTo(size*0.8, size*0.5);
        ctx.stroke();
    }
    else if (type === 'dots') {
        ctx.fillStyle = solidColor;
        const spacing = size * 0.25;
        for (let x = -size; x <= size; x += spacing) {
            for (let y = -size; y y <= size; y += spacing) {
                const dist = Math.sqrt(x*x + y*y);
                if (dist < size) {
                    const radius = (1 - (dist / size)) * (spacing * 0.4);
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    ctx.restore();
}

function generateVisualDecalButtons() {
    document.querySelectorAll('.decal-btn').forEach(btn => {
        const shape = btn.getAttribute('data-shape');
        const tCanvas = document.createElement('canvas');
        tCanvas.width = 64; tCanvas.height = 64;
        const tCtx = tCanvas.getContext('2d');
        tCtx.clearRect(0, 0, 64, 64);
        drawShape(tCtx, 32, 32, 22, shape, currentColor);
        
        btn.style.backgroundImage = `url(${tCanvas.toDataURL()})`;
        btn.style.backgroundSize = 'contain';
        btn.style.backgroundRepeat = 'no-repeat';
        btn.style.backgroundPosition = 'center';
    });
}
generateVisualDecalButtons();

const materialCache = {};
function getDecalMaterial(type, color) {
    const key = type + color;
    if (materialCache[key]) return materialCache[key];

    const dCanvas = document.createElement('canvas');
    dCanvas.width = 1024; dCanvas.height = 1024;
    const ctx = dCanvas.getContext('2d');
    
    ctx.clearRect(0, 0, 1024, 1024);
    drawShape(ctx, 512, 512, 480, type, color);

    const texture = new THREE.CanvasTexture(dCanvas);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.encoding = THREE.sRGBEncoding;
    texture.needsUpdate = true; 

    const mat = new THREE.MeshStandardMaterial({
        map: texture, 
        transparent: true, 
        depthTest: true, 
        depthWrite: false, 
        polygonOffset: true, 
        polygonOffsetFactor: -4, 
        polygonOffsetUnits: -4, 
        roughness: 0.1, 
        metalness: 0.1
    });
    
    materialCache[key] = mat;
    return mat;
}

// --- 5. Projector & Raycast Engine ---
const raycaster = new THREE.Raycaster();
const mouseVector = new THREE.Vector2();
const domCanvas = renderer.domElement;

function getIntersection(clientX, clientY) {
    if (paintableMeshes.length === 0) return null;
    const rect = domCanvas.getBoundingClientRect();
    mouseVector.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseVector.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseVector, camera);
    const intersects = raycaster.intersectObjects(paintableMeshes, false);
    return intersects.length > 0 ? intersects[0] : null;
}

function executeUVBrush(hit) {
    if (!hit.uv) return;
    const x = hit.uv.x * 2048;
    const y = hit.uv.y * 2048;
    pCtx.fillStyle = currentColor;
    
    if (activeShape === 'circle') {
        pCtx.beginPath();
        pCtx.arc(x, y, activeSize * 3, 0, Math.PI * 2);
        pCtx.fill();
    } else {
        const span = activeSize * 5;
        pCtx.fillRect(x - span/2, y - span/2, span, span);
    }
}

function projectStamp(point, normal, rotation, size, shape, color, zIndex, isPreview = false) {
    const dummy = new THREE.Object3D();
    dummy.position.copy(point);
    dummy.lookAt(point.clone().add(normal));
    dummy.rotateZ(rotation * Math.PI / 180);

    const depth = Math.max(5.0, size);
    const scale = new THREE.Vector3(size, size, depth); 
    const mat = getDecalMaterial(shape, color);
    
    let renderMat = mat;
    if (isPreview) {
        renderMat = mat.clone();
        renderMat.transparent = true; 
        renderMat.opacity = 1.0; 
    }

    const meshes = [];
    paintableMeshes.forEach(mesh => {
        const geo = new THREE.DecalGeometry(mesh, point, dummy.rotation, scale);
        if (geo.attributes.position.count > 0) {
            const decalMesh = new THREE.Mesh(geo, renderMat);
            decalMesh.renderOrder = zIndex; 
            meshes.push(decalMesh);
        }
    });

    const targetGroup = isPreview ? ghostDecalGroup : mainDecalGroup;
    meshes.forEach(m => targetGroup.add(m));
    return meshes; 
}

function clearGhosts() {
    while(ghostDecalGroup.children.length > 0) {
        const child = ghostDecalGroup.children[0];
        child.geometry.dispose();
        ghostDecalGroup.remove(child);
    }
}

function refreshLivePreview() {
    if (!liveDecalHitData) return;
    const rotVal = parseInt(ui.decalRot.value);
    const sizeVal = parseInt(ui.decalSize.value) / 100;
    projectStamp(liveDecalHitData.point, liveDecalHitData.normal, rotVal, sizeVal, activeDecalType, currentColor, globalRenderOrder + 50, true);
}

// --- Interaction Core (Smooth Lines & Button Stamps) ---
let touchStartPos = new THREE.Vector2();
let lastScreenPos = new THREE.Vector2();
let gestureMoved = false;

domCanvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.target.closest('#control-center') || e.target.closest('.top-navbar') || e.target.closest('.camera-navbar') || e.target.closest('#customColorModal')) return;
    touchStartPos.set(e.clientX, e.clientY);
    lastScreenPos.set(e.clientX, e.clientY);
    gestureMoved = false;

    const hit = getIntersection(e.clientX, e.clientY);
    if (!hit) return;

    if (currentMode === 'brush') {
        controls.enabled = false; 
        isPainting = true;
        saveCanvasState();
        executeUVBrush(hit);
        textureNeedsGPUUpdate = true; 
    } else if (currentMode === 'decal') {
        controls.enabled = false; 
        isPlacingDecal = true;
        liveDecalHitData = { point: hit.point.clone(), normal: hit.face.normal.clone() };
        clearGhosts();
        refreshLivePreview();
        showToast('Step 2: Now adjust Size and Rotation below', 0); 
    }
});

domCanvas.addEventListener('pointermove', (e) => {
    if (!e.isPrimary) return;
    const currentPos = new THREE.Vector2(e.clientX, e.clientY);
    if (touchStartPos.distanceTo(currentPos) > 8) gestureMoved = true;

    if (currentMode === 'brush' && isPainting) {
        const dist = lastScreenPos.distanceTo(currentPos);
        const steps = Math.max(1, Math.floor(dist / 3)); 

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const lerpX = lastScreenPos.x + (currentPos.x - lastScreenPos.x) * t;
            const lerpY = lastScreenPos.y + (currentPos.y - lastScreenPos.y) * t;
            const hit = getIntersection(lerpX, lerpY);
            if (hit) executeUVBrush(hit);
        }
        textureNeedsGPUUpdate = true; 
        lastScreenPos.copy(currentPos);

    } else if (currentMode === 'decal' && liveDecalHitData && isPlacingDecal) {
        const hit = getIntersection(e.clientX, e.clientY);
        if (hit) {
            liveDecalHitData = { point: hit.point.clone(), normal: hit.face.normal.clone() };
            clearGhosts();
            refreshLivePreview();
        }
    }
});

domCanvas.addEventListener('pointerup', (e) => {
    if (!e.isPrimary) return;
    isPainting = false;
    isPlacingDecal = false;
    controls.enabled = (currentMode !== 'brush' && currentMode !== 'decal'); 
    if (currentMode === 'decal') controls.enabled = true; 

    if (!gestureMoved && currentMode === 'bucket') {
        const hit = getIntersection(e.clientX, e.clientY);
        if (hit) {
            actionHistory.push({ type: 'bucket', mesh: hit.object, oldColor: hit.object.material.color.getHex() });
            hit.object.material.color.set(currentColor);
        }
    }
});

// Explicit Button Decal Application
ui.commitDecalBtn.addEventListener('click', () => {
    if (currentMode === 'decal' && liveDecalHitData) {
        const rotVal = parseInt(ui.decalRot.value);
        const sizeVal = parseInt(ui.decalSize.value) / 100;
        
        const meshes = projectStamp(liveDecalHitData.point, liveDecalHitData.normal, rotVal, sizeVal, activeDecalType, currentColor, globalRenderOrder, false);
        stampHistory.push({ point: liveDecalHitData.point.clone(), normal: liveDecalHitData.normal.clone(), rot: rotVal, size: sizeVal, shape: activeDecalType, color: currentColor, zIndex: globalRenderOrder });
        
        actionHistory.push({ type: 'decal', meshes: meshes });
        globalRenderOrder++; 
        
        clearGhosts();
        liveDecalHitData = null; 
        showToast('Decal Applied! Place another or change tools.', 3000);
    }
});

ui.undoBtn.addEventListener('click', () => {
    if (actionHistory.length > 0) {
        const lastAction = actionHistory.pop();
        if (lastAction.type === 'canvas') {
            pCtx.putImageData(lastAction.data, 0, 0);
            textureNeedsGPUUpdate = true;
        } else if (lastAction.type === 'bucket') {
            lastAction.mesh.material.color.setHex(lastAction.oldColor);
        } else if (lastAction.type === 'decal') {
            lastAction.meshes.forEach(mesh => {
                mesh.geometry.dispose();
                if (mesh.parent) mesh.parent.remove(mesh);
            });
            stampHistory.pop(); 
        }
        showToast('Undo Successful', 2000);
    }
});

ui.resetBtn.addEventListener('click', () => {
    saveCanvasState();
    resetToTextureDefaults();
    clearGhosts();
    while(mainDecalGroup.children.length > 0) { mainDecalGroup.children[0].geometry.dispose(); mainDecalGroup.remove(mainDecalGroup.children[0]); }
    
    stampHistory.length = 0;
    globalRenderOrder = 1;
    liveDecalHitData = null;
    
    paintableMeshes.forEach(mesh => {
        if (mesh.material) mesh.material.color.setHex(0xffffff);
    });
    showToast('Car Reset to Factory Settings', 2000);
});

// --- 6. GLTF Car Asset Loader ---
const loader = new THREE.GLTFLoader();
const textureLoader = new THREE.TextureLoader();

const baseTexture = textureLoader.load('textures/Livery_baseColor.png');
baseTexture.flipY = false;
baseTexture.encoding = THREE.sRGBEncoding;

const modelCache = {}; 
const uiLogoText = document.getElementById('loading-text'); 

loader.load(
    'scene.gltf', 
    (gltf) => {
        if (uiLogoText) {
            uiLogoText.innerText = ''; 
        }

        const carModel = gltf.scene;
        
        const initialBox = new THREE.Box3().setFromObject(carModel);
        const size = new THREE.Vector3();
        initialBox.getSize(size);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const scaleFactor = 8.0 / maxDim; 
            carModel.scale.setScalar(scaleFactor);
        }
        
        const finalBox = new THREE.Box3().setFromObject(carModel);
        const center = finalBox.getCenter(new THREE.Vector3());
        carModel.position.sub(center);

        // SHIFT ENTIRE SCENE UP TO CLEAR BOTTOM UI
        const verticalShift = window.innerWidth < 650 ? 3.0 : 1.5; 
        carModel.position.y += verticalShift;

        // FIXED: The floor box has a thickness of 0.5. 
        // We subtract exactly half its thickness (0.25) so its top edge sits perfectly under the tires.
        const updatedBox = new THREE.Box3().setFromObject(carModel);
        studioFloor.position.y = updatedBox.min.y - 0.25; 
        studioFloor.visible = true;
        
        // Position walls safely around the floor
        paintBooth.position.y = studioFloor.position.y + 19.5; 
        paintBooth.visible = true;

        // Position Toplight Relative to the new floor height
        topLight.position.set(0, studioFloor.position.y + 18, 0);

        // LOCK CAMERA TARGET TO THE FLOOR
        globalTargetY = studioFloor.position.y;
        controls.target.set(0, globalTargetY, 0);
        updateCameraTo('iso');

        const targetMeshes = [];
        carModel.traverse((node) => {
            if (node.isMesh) {
                targetMeshes.push(node);
            }
        });

        targetMeshes.forEach((node) => {
            node.castShadow = true; 
            node.receiveShadow = true;
            const id = (node.name + (node.material ? node.material.name : '')).toLowerCase();
            
            if (!id.includes('wheel') && !id.includes('tire') && !id.includes('glass')) {
                if (node.material) {
                    const parentId = node.parent ? node.parent.uuid : 'root';
                    const matName = node.material.name || 'unnamed';
                    const groupKey = parentId + "_" + matName;
                    
                    if (!modelCache[groupKey]) {
                        modelCache[groupKey] = node.material.clone();
                        modelCache[groupKey].color.setHex(0xffffff); 
                        modelCache[groupKey].map = baseTexture;
                        modelCache[groupKey].roughness = 0.4; 
                        modelCache[groupKey].metalness = 0.5; 
                    }
                    node.material = modelCache[groupKey];
                    node.material.needsUpdate = true;
                }
                
                paintableMeshes.push(node); 
                
                const paintShell = new THREE.Mesh(
                    node.geometry,
                    new THREE.MeshStandardMaterial({
                        map: canvasTexture,
                        transparent: true,
                        depthWrite: false,
                        polygonOffset: true,
                        polygonOffsetFactor: -8, 
                        polygonOffsetUnits: -8,
                        roughness: 0.3,
                        metalness: 0.2
                    })
                );
                node.add(paintShell); 
            }
        });
        
        scene.add(carModel);
        showToast('Car Loaded! Pick a tool to start designing.', 4000);
    },
    (xhr) => {
        if (uiLogoText) {
            if (xhr.total > 0) {
                const percent = Math.round((xhr.loaded / xhr.total) * 100);
                uiLogoText.innerText = `LOADING... ${percent}%`;
            } else {
                const mb = (xhr.loaded / 1048576).toFixed(1);
                uiLogoText.innerText = `LOADING... ${mb}MB`;
            }
        }
    },
    (error) => {
        if (uiLogoText) {
            uiLogoText.innerText = '❌ LOAD ERROR';
            uiLogoText.style.color = '#e10600';
        }
        console.error('GLTF Load Error:', error);
    }
);

// --- 7. Animation Loop ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; 
    camera.updateProjectionMatrix(); 
    renderer.setSize(window.innerWidth, window.innerHeight);
    controls.target.set(0, globalTargetY, 0);
    controls.update();
});

function animate() { 
    requestAnimationFrame(animate); 
    
    if (controls.enabled) controls.update(); 
    
    if (textureNeedsGPUUpdate) {
        canvasTexture.needsUpdate = true;
        textureNeedsGPUUpdate = false;
    }
    
    renderer.render(scene, camera); 
}
animate();