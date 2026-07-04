// --- 1. Scene, Camera, & Renderer ---
const container = document.getElementById('viewport3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1a1a');

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
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

// Dynamic Camera Framing (Tuned aggressively to clear bottom mobile sheets)
function getCamDist() { return window.innerWidth < 650 ? 25 : 10; }
function getCamOffsetY() { return window.innerWidth < 650 ? -3.5 : -0.2; }

controls.target.set(0, getCamOffsetY(), 0); 

function updateCameraTo(view) {
    if (view === 'free') return;
    const d = getCamDist();
    const yOff = getCamOffsetY();
    
    let tZ = 0;
    let cZ = 0;
    
    // Specifically push the Top View camera backwards along the Z-axis on mobile
    // This physically shifts the car UP towards the top of the phone screen
    if (view === 'top' && window.innerWidth < 650) {
        tZ = 3.5;
        cZ = 3.5;
    }
    
    // Elevated height properties (2.5 - 3.0) clear the floor pans cleanly when looking downward
    const views = {
        side: new THREE.Vector3(d, 2.5, 0),
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
const mirrorDecalGroup = new THREE.Group();
const ghostDecalGroup = new THREE.Group(); // Handles real-time floating preview

scene.add(mainDecalGroup);
scene.add(mirrorDecalGroup);
scene.add(ghostDecalGroup);

let globalRenderOrder = 1; 
let stampHistory = []; 
const actionHistory = []; 

// Texture Throttling System (PREVENTS CRASHES)
const paintCanvas = document.createElement('canvas');
paintCanvas.width = 2048; paintCanvas.height = 2048;
const pCtx = paintCanvas.getContext('2d');
const canvasTexture = new THREE.CanvasTexture(paintCanvas);
canvasTexture.flipY = false;
let textureNeedsGPUUpdate = false; 

const baseMapImage = new Image();
baseMapImage.src = 'textures/Livery_baseColor.png';
baseMapImage.onload = () => resetToTextureDefaults();

function resetToTextureDefaults() {
    pCtx.clearRect(0, 0, 2048, 2048);
    pCtx.drawImage(baseMapImage, 0, 0, 2048, 2048);
    textureNeedsGPUUpdate = true;
}

function saveCanvasState() {
    if (actionHistory.length > 15) actionHistory.shift();
    actionHistory.push({ type: 'canvas', data: pCtx.getImageData(0, 0, 2048, 2048) });
}

// --- 3. UI, State, & Handlers ---
let currentMode = 'camera'; 
let activeShape = 'circle'; 
let activeSize = 3; 
let activeCamView = 'free';
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
    decalType: document.getElementById('decalType'),
    decalRot: document.getElementById('decalRot'),
    decalSize: document.getElementById('toolSize'),
    commitDecalBtn: document.getElementById('commitDecalBtn'),
    mirrorBtn: document.getElementById('mirrorBtn'),
    undoBtn: document.getElementById('undoBtn'),
    resetBtn: document.getElementById('resetBtn'),
    helpBtn: document.getElementById('helpBtn'),
    helpModal: document.getElementById('helpModal'),
    closeHelpBtn: document.getElementById('closeHelpBtn'),
    installAppBtn: document.getElementById('installAppBtn')
};

function setMode(mode) {
    currentMode = mode;
    ['brush', 'bucket', 'decal'].forEach(m => ui[m]?.classList.remove('active'));
    if (ui[mode]) ui[mode].classList.add('active');
    
    ui.brushWrap.style.display = (mode === 'brush') ? 'flex' : 'none';
    ui.decalWrap.style.display = (mode === 'decal') ? 'flex' : 'none';
    
    clearGhosts();
    controls.enabled = (mode !== 'brush'); 
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

// Custom Palette Logic
document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', (e) => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        e.target.classList.add('active');
        currentColor = e.target.getAttribute('data-color');
        if (currentMode === 'decal') updateLiveDecalPreview();
    });
});

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
        activeCamView = view;
        ui.mirrorBtn.style.display = (view === 'side') ? 'block' : 'none';
        
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
ui.decalType.addEventListener('change', updateLiveDecalPreview);
ui.decalSize.addEventListener('input', updateLiveDecalPreview);
ui.decalRot.addEventListener('input', updateLiveDecalPreview);

// --- 4. Geometry and Texture Generators ---
function drawShape(ctx, x, y, size, type, color) {
    ctx.save(); ctx.fillStyle = color; ctx.translate(x, y);

    if (type === 'star') {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            ctx.lineTo(Math.cos((18+i*72)*Math.PI/180)*size, -Math.sin((18+i*72)*Math.PI/180)*size);
            ctx.lineTo(Math.cos((54+i*72)*Math.PI/180)*(size/2), -Math.sin((54+i*72)*Math.PI/180)*(size/2));
        }
        ctx.closePath(); ctx.fill();
    } else if (type === 'stripe') {
        ctx.beginPath(); ctx.moveTo(-size/2, -size*2); ctx.lineTo(size/2, -size*1.5); ctx.lineTo(size/4, size*2); ctx.lineTo(-size/2, size*2); ctx.closePath(); ctx.fill();
    } else if (type === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI*2); ctx.fill();
    } else if (type === 'checkered') {
        const sq = size / 2;
        ctx.fillRect(-sq, -sq, sq, sq); ctx.fillRect(0, 0, sq, sq); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, -sq, sq, sq); ctx.fillRect(-sq, 0, sq, sq);
    } else if (type === 'number1') {
        ctx.font = `bold ${size*1.8}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText("1", 0, 0);
    } else if (type === 'triangle') {
        ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.866, size * 0.5); ctx.lineTo(-size * 0.866, size * 0.5); ctx.closePath(); ctx.fill();
    } else if (type === 'hexagon') {
        ctx.beginPath(); for (let i = 0; i < 6; i++) { ctx.lineTo(size * Math.cos(i * Math.PI / 3), size * Math.sin(i * Math.PI / 3)); } ctx.closePath(); ctx.fill();
    } else if (type === 'chevron') {
        ctx.beginPath(); ctx.moveTo(-size/2, -size/2); ctx.lineTo(size/2, 0); ctx.lineTo(-size/2, size/2); ctx.lineTo(-size/4, 0); ctx.closePath(); ctx.fill();
    } else if (type === 'diamond') {
        ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size/1.5, 0); ctx.lineTo(0, size); ctx.lineTo(-size/1.5, 0); ctx.closePath(); ctx.fill();
    } else if (type === 'swoosh') {
        ctx.beginPath(); ctx.moveTo(-size, size/2); ctx.quadraticCurveTo(0, -size, size, -size/2); ctx.quadraticCurveTo(size/2, -size/4, -size, size/2); ctx.closePath(); ctx.fill();
    } else if (type === 'cross') {
        const w = size / 3; ctx.fillRect(-w/2, -size, w, size*2); ctx.fillRect(-size, -w/2, size*2, w);
    } else if (type === 'square') {
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
    drawShape(dCanvas.getContext('2d'), 512, 512, 480, type, color);

    const texture = new THREE.CanvasTexture(dCanvas);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const mat = new THREE.MeshStandardMaterial({
        map: texture, transparent: true, depthTest: true, depthWrite: false, 
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.2
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
    const intersects = raycaster.intersectObjects(paintableMeshes, true);
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

function projectStamp(point, normal, rotation, size, shape, color, zIndex, isPreview = false, isMirrored = false) {
    const dummy = new THREE.Object3D();
    dummy.position.copy(point);
    dummy.lookAt(point.clone().add(normal));
    dummy.rotateZ(rotation * Math.PI / 180);

    const scale = new THREE.Vector3(size, size, Math.min(size, 2.0)); 
    const mat = getDecalMaterial(shape, color);
    
    let renderMat = mat;
    if (isPreview) {
        renderMat = mat.clone();
        renderMat.opacity = 0.5; 
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

    // FIXED: Properly routes the mesh to the dedicated preview group
    const targetGroup = isPreview ? ghostDecalGroup : (isMirrored ? mirrorDecalGroup : mainDecalGroup);
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
    projectStamp(liveDecalHitData.point, liveDecalHitData.normal, rotVal, sizeVal, ui.decalType.value, currentColor, globalRenderOrder + 50, true);
}

// --- Interaction Core (Smooth Lines & Taps) ---
let touchStartPos = new THREE.Vector2();
let lastScreenPos = new THREE.Vector2();
let gestureMoved = false;
let currentStrokeMeshes = [];

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

    if (!gestureMoved && currentMode === 'bucket') {
        const hit = getIntersection(e.clientX, e.clientY);
        if (hit) {
            actionHistory.push({ type: 'bucket', mesh: hit.object, oldColor: hit.object.material.color.getHex() });
            hit.object.material.color.set(currentColor);
        }
    }
});

ui.commitDecalBtn.addEventListener('click', () => {
    if (currentMode === 'decal' && liveDecalHitData) {
        const rotVal = parseInt(ui.decalRot.value);
        const sizeVal = parseInt(ui.decalSize.value) / 100;
        const targetShape = ui.decalType.value;

        const meshes = projectStamp(liveDecalHitData.point, liveDecalHitData.normal, rotVal, sizeVal, targetShape, currentColor, globalRenderOrder, false, false);
        stampHistory.push({ point: liveDecalHitData.point.clone(), normal: liveDecalHitData.normal.clone(), rot: rotVal, size: sizeVal, shape: targetShape, color: currentColor, zIndex: globalRenderOrder });
        
        actionHistory.push({ type: 'decal', meshes: meshes });
        globalRenderOrder++; 
        
        clearGhosts();
        liveDecalHitData = null; 
    }
});

// --- Action Commands ---
ui.mirrorBtn.addEventListener('click', () => {
    if (activeCamView !== 'side') return;
    
    saveCanvasState();
    const halfWidth = 1024; const height = 2048;
    const leftSide = pCtx.getImageData(0, 0, halfWidth, height);
    const rightSide = pCtx.getImageData(halfWidth, 0, halfWidth, height);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < halfWidth; x++) {
            const srcIdx = (y * halfWidth + x) * 4;
            const tgtIdx = (y * halfWidth + (halfWidth - 1 - x)) * 4;
            rightSide.data[tgtIdx] = leftSide.data[srcIdx];
            rightSide.data[tgtIdx+1] = leftSide.data[srcIdx+1];
            rightSide.data[tgtIdx+2] = leftSide.data[srcIdx+2];
            rightSide.data[tgtIdx+3] = leftSide.data[srcIdx+3];
        }
    }
    pCtx.putImageData(rightSide, halfWidth, 0);
    textureNeedsGPUUpdate = true;

    while(mirrorDecalGroup.children.length > 0) {
        const child = mirrorDecalGroup.children[0];
        child.geometry.dispose();
        mirrorDecalGroup.remove(child);
    }
    stampHistory.forEach(stamp => {
        const mPoint = stamp.point.clone(); mPoint.x *= -1;
        const mNormal = stamp.normal.clone(); mNormal.x *= -1;
        projectStamp(mPoint, mNormal, -stamp.rot, stamp.size, stamp.shape, stamp.color, stamp.zIndex, false, true);
    });
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
    while(mirrorDecalGroup.children.length > 0) { mirrorDecalGroup.children[0].geometry.dispose(); mirrorDecalGroup.remove(mirrorDecalGroup.children[0]); }
    
    stampHistory.length = 0;
    globalRenderOrder = 1;
    liveDecalHitData = null;
    
    paintableMeshes.forEach(mesh => {
        if (mesh.material) mesh.material.color.setHex(0xffffff);
    });
});

// --- 6. GLTF Car Asset Loader ---
const loader = new THREE.GLTFLoader();
const modelCache = {}; 

loader.load('scene.gltf', (gltf) => {
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
                        modelCache[groupKey].map = canvasTexture; 
                    }
                    node.material = modelCache[groupKey];
                    node.material.needsUpdate = true;
                }
                paintableMeshes.push(node); 
            }
        }
    });
    const box = new THREE.Box3().setFromObject(carModel);
    carModel.position.sub(box.getCenter(new THREE.Vector3()));
    scene.add(carModel);
});

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