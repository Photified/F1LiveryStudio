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

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const topLight = new THREE.DirectionalLight(0xffffff, 0.6);
topLight.position.set(0, 10, 0);
scene.add(topLight);
const sideLight1 = new THREE.PointLight(0xffffff, 0.4, 50);
sideLight1.position.set(5, 3, 5);
scene.add(sideLight1);
const sideLight2 = new THREE.PointLight(0xffffff, 0.4, 50);
sideLight2.position.set(-5, 3, -5);
scene.add(sideLight2);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, -0.2, 0); 

function getCamDist() { return window.innerWidth < 800 ? 18 : 12; }

function updateCameraTo(view) {
    if (view === 'free') return;
    const d = getCamDist();
    const views = {
        side: new THREE.Vector3(d, 0.5, 0),
        front: new THREE.Vector3(0, 0.5, d),
        back: new THREE.Vector3(0, 0.5, -d),
        top: new THREE.Vector3(0, d, 0),
        iso: new THREE.Vector3(-d*0.7, d*0.5, d*0.7)
    };
    if (views[view]) {
        camera.position.copy(views[view]);
        camera.lookAt(0, -0.2, 0);
        controls.target.set(0, -0.2, 0);
        controls.update();
    }
}
updateCameraTo('iso');

// --- 2. Unified Raster Canvas Core ---
const paintCanvas = document.createElement('canvas');
paintCanvas.width = 2048; paintCanvas.height = 2048;
const pCtx = paintCanvas.getContext('2d');

const canvasTexture = new THREE.CanvasTexture(paintCanvas);
canvasTexture.flipY = false;

const actionHistory = []; 
const MAX_UNDO = 15;

function saveState() {
    if (actionHistory.length >= MAX_UNDO) actionHistory.shift();
    actionHistory.push(pCtx.getImageData(0, 0, 2048, 2048));
}

const baseMapImage = new Image();
baseMapImage.src = 'textures/Livery_baseColor.png';
baseMapImage.onload = () => {
    resetToTextureDefaults();
};

function resetToTextureDefaults() {
    pCtx.clearRect(0, 0, 2048, 2048);
    pCtx.drawImage(baseMapImage, 0, 0, 2048, 2048);
    canvasTexture.needsUpdate = true;
}

// --- 3. UI, State, & Modal Handlers ---
let currentMode = 'camera'; 
let activeShape = 'circle'; 
let activeSize = 10; 
let activeCamView = 'free';
let isPainting = false;
let paintableMeshes = []; 

const ui = {
    brush: document.getElementById('mode-brush'),
    bucket: document.getElementById('mode-bucket'),
    decal: document.getElementById('mode-decal'),
    color: document.getElementById('paintColor'),
    brushWrap: document.getElementById('brush-presets-wrap'),
    decalWrap: document.getElementById('decal-select-wrap'),
    decalType: document.getElementById('decalType'),
    decalRot: document.getElementById('decalRot'),
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
    
    ui.brushWrap.style.display = (mode === 'brush' || mode === 'decal') ? 'flex' : 'none';
    ui.decalWrap.style.display = (mode === 'decal') ? 'flex' : 'none';
    controls.enabled = true; 
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

document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeSize = parseInt(e.target.getAttribute('data-size'));
        activeShape = e.target.classList.contains('circle-size') ? 'circle' : 'square';
    });
});

ui.undoBtn.addEventListener('click', () => {
    if (actionHistory.length > 0) {
        pCtx.putImageData(actionHistory.pop(), 0, 0);
        canvasTexture.needsUpdate = true;
    }
});

ui.resetBtn.addEventListener('click', () => {
    saveState();
    resetToTextureDefaults();
    paintableMeshes.forEach(mesh => {
        if (mesh.material && !mesh.material.map) {
            mesh.material.color.setHex(0xffffff);
        }
    });
});

ui.mirrorBtn.addEventListener('click', () => {
    if (activeCamView !== 'side') return;
    saveState();
    
    const halfWidth = 1024;
    const height = 2048;
    
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
    canvasTexture.needsUpdate = true;
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

// --- 4. 2D Raster Graphics System ---
function drawShape(ctx, x, y, size, type, color) {
    ctx.save(); ctx.fillStyle = color; ctx.translate(x, y);
    const rotVal = parseInt(ui.decalRot.value);
    ctx.rotate(rotVal * Math.PI / 180);

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

// --- 5. Projector Raycast Engine ---
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

function drawToUVLocation(hit, forceShape = null) {
    if (!hit.uv) return;
    const x = hit.uv.x * 2048;
    const y = hit.uv.y * 2048;
    const targetShape = forceShape || (currentMode === 'decal' ? ui.decalType.value : activeShape);
    
    drawShape(pCtx, x, y, activeSize, targetShape, ui.color.value);
    canvasTexture.needsUpdate = true;
}

let touchStartPos = new THREE.Vector2();
let gestureMoved = false;

domCanvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.target.closest('#control-center') || e.target.closest('header')) return;
    touchStartPos.set(e.clientX, e.clientY);
    gestureMoved = false;

    if (currentMode === 'brush') {
        controls.enabled = false; 
        isPainting = true;
        saveState();
        const hit = getIntersection(e.clientX, e.clientY);
        if (hit) drawToUVLocation(hit);
    }
});

domCanvas.addEventListener('pointermove', (e) => {
    if (!e.isPrimary) return;
    if (touchStartPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 8) {
        gestureMoved = true;
    }

    if (currentMode === 'brush' && isPainting) {
        const hit = getIntersection(e.clientX, e.clientY);
        if (hit) drawToUVLocation(hit);
    }
});

domCanvas.addEventListener('pointerup', (e) => {
    if (!e.isPrimary) return;
    isPainting = false;
    controls.enabled = true;

    if (!gestureMoved && currentMode !== 'camera') {
        const hit = getIntersection(e.clientX, e.clientY);
        if (!hit) return;

        saveState();
        if (currentMode === 'bucket') {
            drawToUVLocation(hit, 'square'); 
        } else if (currentMode === 'decal') {
            drawToUVLocation(hit);
        }
    }
});

// --- 6. GLTF Model Loader Asset Loop ---
const loader = new THREE.GLTFLoader();
loader.load('scene.gltf', (gltf) => {
    const carModel = gltf.scene;
    carModel.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true; node.receiveShadow = true;
            const id = (node.name + (node.material ? node.material.name : '')).toLowerCase();
            
            if (!id.includes('wheel') && !id.includes('tire') && !id.includes('glass')) {
                paintableMeshes.push(node); 
                if (node.material) {
                    node.material = node.material.clone();
                    node.material.map = canvasTexture; 
                    node.material.roughness = 0.2;
                    node.material.needsUpdate = true;
                }
            }
        }
    });
    const box = new THREE.Box3().setFromObject(carModel);
    carModel.position.sub(box.getCenter(new THREE.Vector3()));
    scene.add(carModel);
});

// --- 7. Animation Frame Core Loop ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
});
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();