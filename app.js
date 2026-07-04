// --- 1. Scene, Camera, & Renderer ---
const container = document.getElementById('viewport3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1a1a');

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputEncoding = THREE.sRGBEncoding; 

container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const topLight = new THREE.DirectionalLight(0xffffff, 0.8);
topLight.position.set(0, 10, 0);
scene.add(topLight);
const sideLight1 = new THREE.PointLight(0xffffff, 0.5, 50);
sideLight1.position.set(5, 3, 5);
scene.add(sideLight1);
const sideLight2 = new THREE.PointLight(0xffffff, 0.5, 50);
sideLight2.position.set(-5, 3, -5);
scene.add(sideLight2);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

function getCamDist() { return window.innerWidth < 650 ? 25 : 10; }
function getCamOffsetY() { return window.innerWidth < 650 ? -3.5 : -0.2; }

controls.target.set(0, getCamOffsetY(), 0); 

let sideToggleRight = true; 

function updateCameraTo(view) {
    if (view === 'free') return;
    const d = getCamDist();
    const yOff = getCamOffsetY();
    
    let tZ = 0;
    let cZ = 0;
    
    if (view === 'top' && window.innerWidth < 650) {
        tZ = 5.0;
        cZ = 5.0;
    }
    
    const views = {
        side: new THREE.Vector3(sideToggleRight ? d : -d, 2.5, 0),
        front: new THREE.Vector3(0, 2.5, d),
        back: new THREE.Vector3(0, 2.5, -d),
        top: new THREE.Vector3(0, d, cZ),
        iso: new THREE.Vector3(-d*0.7, 3.0, d*0.7)
    };
    if (views[view]) {
        camera.position.copy(views[view]);
        camera.lookAt(0, yOff, tZ);
        controls.target.set(0, yOff, tZ);
        controls.update();
    }
}
updateCameraTo('iso'); 

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

// --- 3. UI, State, & Handlers ---
let currentMode = 'camera'; 
let activeShape = 'circle'; 
let activeSize = 3; 
let activeCamView = 'free';
let activeDecalType = 'solid-stripe';
let isPainting = false;
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
    undoBtn: document.getElementById('undoBtn'),
    resetBtn: document.getElementById('resetBtn'),
    helpBtn: document.getElementById('helpBtn'),
    helpModal: document.getElementById('helpModal'),
    closeHelpBtn: document.getElementById('closeHelpBtn'),
    installAppBtn: document.getElementById('installAppBtn'),
    nativeColorPicker: document.getElementById('nativeColorPicker'),
    recentColorsWrap: document.getElementById('recent-colors')
};

function setMode(mode) {
    currentMode = mode;
    ['brush', 'bucket', 'decal'].forEach(m => ui[m]?.classList.remove('active'));
    if (ui[mode]) ui[mode].classList.add('active');
    
    ui.brushWrap.style.display = (mode === 'brush') ? 'flex' : 'none';
    ui.decalWrap.style.display = (mode === 'decal') ? 'flex' : 'none';
    
    clearGhosts();
    controls.enabled = (mode !== 'brush'); 
    
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

// Visual Decal Picker Logic
document.querySelectorAll('.decal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.decal-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeDecalType = e.target.getAttribute('data-shape');
        updateLiveDecalPreview();
    });
});

// Dynamic CSS styling to ensure the massive color palette wraps cleanly
ui.recentColorsWrap.style.flexWrap = 'wrap';
ui.recentColorsWrap.style.justifyContent = 'center';
ui.recentColorsWrap.style.padding = '4px 0';
ui.recentColorsWrap.style.maxHeight = '90px';
ui.recentColorsWrap.style.overflowY = 'auto';

// Full Rainbow Spectrum: Light, Standard, Dark + Monochrome
let recentColors = [
    '#ffcccc', '#e10600', '#800000', // Red
    '#ffe5cc', '#ff8700', '#cc6600', // Orange
    '#ffffcc', '#ffd500', '#808000', // Yellow
    '#ccffcc', '#00a19c', '#006600', // Green
    '#cce5ff', '#007aff', '#000080', // Blue
    '#e5ccff', '#4b0082', '#29004d', // Indigo
    '#ffccff', '#ee82ee', '#800080', // Violet
    '#ffffff', '#808080', '#000000'  // Monochrome
];

function renderRecentColors() {
    ui.recentColorsWrap.innerHTML = '';
    recentColors.forEach(c => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch' + (c === currentColor ? ' active' : '');
        swatch.style.background = c;
        swatch.setAttribute('data-color', c);
        swatch.addEventListener('click', () => {
            currentColor = c;
            ui.nativeColorPicker.value = c;
            renderRecentColors();
            if (currentMode === 'decal') updateLiveDecalPreview();
        });
        ui.recentColorsWrap.appendChild(swatch);
    });
}

ui.nativeColorPicker.addEventListener('input', (e) => {
    currentColor = e.target.value;
    if (currentMode === 'decal') updateLiveDecalPreview();
});

ui.nativeColorPicker.addEventListener('change', () => {
    if (!recentColors.includes(currentColor)) {
        recentColors.unshift(currentColor);
        if (recentColors.length > 36) recentColors.pop(); 
        renderRecentColors();
    }
});
renderRecentColors(); 

document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeSize = parseInt(e.target.getAttribute('data-size'));
        activeShape = e.target.classList.contains('circle-size') ? 'circle' : 'square';
    });
});

document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        const view = e.target.getAttribute('data-cam');
        if (view === 'side' && activeCamView === 'side') {
            sideToggleRight = !sideToggleRight; 
        }
        
        activeCamView = view;
        
        if (view === 'free') setMode('camera');
        else updateCameraTo(view);
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

// --- 4. Geometry and Texture Generators (F1 STYLE) ---
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

    if (type === 'solid-stripe') {
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

    ctx.restore();
}

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
        roughness: 0.2
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
    meshes.forEach(m => {
        targetGroup.add(m);
    });
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

// --- Interaction Core (Smooth Lines & Taps) ---
let touchStartPos = new THREE.Vector2();
let lastScreenPos = new THREE.Vector2();
let gestureMoved = false;
let lastTapTime = 0; 

domCanvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.target.closest('#control-center') || e.target.closest('.top-navbar') || e.target.closest('.camera-navbar')) return;
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
        liveDecalHitData = { point: hit.point.clone(), normal: hit.face.normal.clone() };
        clearGhosts();
        refreshLivePreview();
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

    } else if (currentMode === 'decal' && liveDecalHitData) {
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
    controls.enabled = (currentMode !== 'brush' && currentMode !== 'decal'); 
    
    if (currentMode === 'decal') controls.enabled = true; 

    const currentTime = Date.now();
    const isDoubleTap = (currentTime - lastTapTime) < 300;
    lastTapTime = currentTime;

    if (isDoubleTap && currentMode === 'decal' && liveDecalHitData && !gestureMoved) {
        const rotVal = parseInt(ui.decalRot.value);
        const sizeVal = parseInt(ui.decalSize.value) / 100;

        const meshes = projectStamp(liveDecalHitData.point, liveDecalHitData.normal, rotVal, sizeVal, activeDecalType, currentColor, globalRenderOrder, false);
        stampHistory.push({ point: liveDecalHitData.point.clone(), normal: liveDecalHitData.normal.clone(), rot: rotVal, size: sizeVal, shape: activeDecalType, color: currentColor, zIndex: globalRenderOrder });
        
        actionHistory.push({ type: 'decal', meshes: meshes });
        globalRenderOrder++; 
    } 
    else if (!gestureMoved && currentMode === 'bucket') {
        const hit = getIntersection(e.clientX, e.clientY);
        if (hit) {
            actionHistory.push({ type: 'bucket', mesh: hit.object, oldColor: hit.object.material.color.getHex() });
            hit.object.material.color.set(currentColor);
        }
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
});

// --- 6. GLTF Car Asset Loader ---
const loader = new THREE.GLTFLoader();
const textureLoader = new THREE.TextureLoader();

const baseTexture = textureLoader.load('textures/Livery_baseColor.png');
baseTexture.flipY = false;
baseTexture.encoding = THREE.sRGBEncoding;

const modelCache = {}; 

loader.load(
    'scene.gltf', 
    (gltf) => {
        const carModel = gltf.scene;
        carModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true; node.receiveShadow = true;
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
                            roughness: 0.2
                        })
                    );
                    
                    node.add(paintShell);
                }
            }
        });
        const box = new THREE.Box3().setFromObject(carModel);
        carModel.position.sub(box.getCenter(new THREE.Vector3()));
        scene.add(carModel);
    },
    undefined,
    (error) => {
        console.error('GLTF Load Error:', error);
        alert("Failed to load 'scene.gltf'. Ensure the file name is exactly 'scene.gltf' (all lowercase) in your GitHub repository. GitHub Pages is case-sensitive!");
    }
);

// --- 7. Animation Loop ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; 
    camera.updateProjectionMatrix(); 
    renderer.setSize(window.innerWidth, window.innerHeight);
    controls.target.set(0, getCamOffsetY(), 0);
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