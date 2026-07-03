// --- 1. Scene, Camera, & Renderer Configuration ---
const container = document.getElementById('viewport3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1a1a');

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-8.5, 3.5, 8.5); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// --- 2. Advanced Lighting Setup ---
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

// --- 3. DUAL-CANVAS ARCHITECTURE & UNDO HISTORY ---
const baseCanvas = document.createElement('canvas');
baseCanvas.width = 2048; baseCanvas.height = 2048;
const bCtx = baseCanvas.getContext('2d');

const renderCanvas = document.createElement('canvas');
renderCanvas.width = 2048; renderCanvas.height = 2048;
const rCtx = renderCanvas.getContext('2d');

const canvasTexture = new THREE.CanvasTexture(renderCanvas);
canvasTexture.flipY = false;

const undoStack = [];
const MAX_UNDO = 5;

function saveState() {
    if (undoStack.length >= MAX_UNDO) undoStack.shift();
    undoStack.push(bCtx.getImageData(0, 0, 2048, 2048));
}

const baseMapImage = new Image();
baseMapImage.src = 'textures/Livery_baseColor.png';
baseMapImage.onload = () => {
    bCtx.drawImage(baseMapImage, 0, 0, 2048, 2048);
    updateRenderCanvas(); 
};

function updateRenderCanvas(ghostDrawCallback = null) {
    rCtx.clearRect(0, 0, 2048, 2048);
    rCtx.drawImage(baseCanvas, 0, 0); 
    
    if (ghostDrawCallback) {
        rCtx.globalAlpha = 0.5; 
        ghostDrawCallback(rCtx);
        rCtx.globalAlpha = 1.0;
    }
    canvasTexture.needsUpdate = true;
}

// --- 4. UI Elements & State Tracking ---
let currentMode = 'camera'; 
let isPainting = false;
let paintableMeshes = []; 

const ui = {
    camera: document.getElementById('mode-camera'),
    brush: document.getElementById('mode-brush'),
    bucket: document.getElementById('mode-bucket'),
    decal: document.getElementById('mode-decal'),
    color: document.getElementById('paintColor'),
    size: document.getElementById('toolSize'),
    decalWrap: document.getElementById('decal-select-wrap'),
    decalType: document.getElementById('decalType'),
    decalRot: document.getElementById('decalRot'),
    undoBtn: document.getElementById('undoBtn'),
    resetBtn: document.getElementById('resetBtn')
};

function setMode(mode) {
    currentMode = mode;
    ['camera', 'brush', 'bucket', 'decal'].forEach(m => ui[m].classList.remove('active'));
    ui[mode].classList.add('active');
    
    ui.decalWrap.style.display = (mode === 'decal') ? 'flex' : 'none';
    controls.enabled = (mode === 'camera');
    
    updateRenderCanvas(); 
}

ui.camera.addEventListener('click', () => setMode('camera'));
ui.brush.addEventListener('click', () => setMode('brush'));
ui.decal.addEventListener('click', () => setMode('decal'));

ui.bucket.addEventListener('click', () => {
    saveState();
    bCtx.fillStyle = ui.color.value;
    bCtx.fillRect(0, 0, 2048, 2048);
    updateRenderCanvas();
    
    paintableMeshes.forEach(m => {
        if (m.material) { m.material.map = canvasTexture; m.material.needsUpdate = true; }
    });
});

ui.undoBtn.addEventListener('click', () => {
    if (undoStack.length > 0) {
        const previousState = undoStack.pop();
        bCtx.putImageData(previousState, 0, 0);
        updateRenderCanvas();
    }
});

ui.resetBtn.addEventListener('click', () => {
    saveState();
    bCtx.clearRect(0, 0, 2048, 2048);
    bCtx.drawImage(baseMapImage, 0, 0, 2048, 2048);
    updateRenderCanvas();
});

// --- 5. Decal Drawing Engine ---
function drawShape(ctx, x, y, size, rotation, type, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.translate(x, y);
    ctx.rotate(rotation * Math.PI / 180); 
    
    if (type === 'star') {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            ctx.lineTo(Math.cos((18+i*72)*Math.PI/180)*size, -Math.sin((18+i*72)*Math.PI/180)*size);
            ctx.lineTo(Math.cos((54+i*72)*Math.PI/180)*(size/2), -Math.sin((54+i*72)*Math.PI/180)*(size/2));
        }
        ctx.closePath();
        ctx.fill();
    } else if (type === 'stripe') {
        ctx.beginPath();
        ctx.moveTo(-size/2, -size*2);
        ctx.lineTo(size/2, -size*1.5);
        ctx.lineTo(size/4, size*2);
        ctx.lineTo(-size/2, size*2);
        ctx.closePath();
        ctx.fill();
    } else if (type === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI*2); ctx.fill();
    } else if (type === 'checkered') {
        const sq = size / 2;
        ctx.fillRect(-sq, -sq, sq, sq); ctx.fillRect(0, 0, sq, sq);
        ctx.fillStyle = "#ffffff"; 
        ctx.fillRect(0, -sq, sq, sq); ctx.fillRect(-sq, 0, sq, sq);
    } else if (type === 'number1') {
        ctx.font = `bold ${size*2}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("1", 0, 0);
    } else if (type === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.866, size * 0.5);
        ctx.lineTo(-size * 0.866, size * 0.5);
        ctx.closePath();
        ctx.fill();
    } else if (type === 'hexagon') {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            ctx.lineTo(size * Math.cos(i * Math.PI / 3), size * Math.sin(i * Math.PI / 3));
        }
        ctx.closePath();
        ctx.fill();
    } else if (type === 'chevron') {
        ctx.beginPath();
        ctx.moveTo(-size/2, -size/2);
        ctx.lineTo(size/2, 0);
        ctx.lineTo(-size/2, size/2);
        ctx.lineTo(-size/4, 0);
        ctx.closePath();
        ctx.fill();
    } else if (type === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size/1.5, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size/1.5, 0);
        ctx.closePath();
        ctx.fill();
    } else if (type === 'swoosh') {
        ctx.beginPath();
        ctx.moveTo(-size, size/2);
        ctx.quadraticCurveTo(0, -size, size, -size/2);
        ctx.quadraticCurveTo(size/2, -size/4, -size, size/2);
        ctx.closePath();
        ctx.fill();
    } else if (type === 'cross') {
        const w = size / 3;
        ctx.fillRect(-w/2, -size, w, size*2);
        ctx.fillRect(-size, -w/2, size*2, w);
    }
    
    ctx.restore();
}

// --- 6. Raycast Projection Engine ---
const raycaster = new THREE.Raycaster();
const mouseVector = new THREE.Vector2();

function getIntersection(e) {
    if (paintableMeshes.length === 0) return null;
    mouseVector.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVector.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouseVector, camera);
    const intersects = raycaster.intersectObjects(paintableMeshes, true);
    return intersects.length > 0 ? intersects[0] : null;
}

window.addEventListener('mousemove', (e) => {
    if (currentMode === 'camera') return;
    
    const hit = getIntersection(e);
    if (!hit || !hit.uv) {
        if (!isPainting) updateRenderCanvas(); 
        return;
    }

    const cX = hit.uv.x * 2048;
    const cY = hit.uv.y * 2048;
    const size = parseInt(ui.size.value);
    const color = ui.color.value;

    if (currentMode === 'brush' && isPainting) {
        bCtx.fillStyle = color;
        bCtx.beginPath();
        bCtx.arc(cX, cY, size, 0, Math.PI*2);
        bCtx.fill();
        updateRenderCanvas();
    } 
    else if (currentMode === 'brush' && !isPainting) {
        updateRenderCanvas((ctx) => {
            ctx.beginPath();
            ctx.arc(cX, cY, size, 0, Math.PI*2);
            ctx.fillStyle = color;
            ctx.fill();
        });
    }
    else if (currentMode === 'decal') {
        const rot = parseInt(ui.decalRot.value);
        updateRenderCanvas((ctx) => drawShape(ctx, cX, cY, size*2, rot, ui.decalType.value, color));
    }
});

window.addEventListener('mousedown', (e) => {
    if (currentMode === 'camera') return;
    
    const hit = getIntersection(e);
    if (!hit || !hit.uv) return;

    saveState();
    
    if (hit.object.material && hit.object.material.map !== canvasTexture) {
        hit.object.material.map = canvasTexture;
        hit.object.material.needsUpdate = true;
    }

    const cX = hit.uv.x * 2048;
    const cY = hit.uv.y * 2048;
    const size = parseInt(ui.size.value);
    const color = ui.color.value;

    if (currentMode === 'brush') {
        isPainting = true;
        bCtx.fillStyle = color;
        bCtx.beginPath(); bCtx.arc(cX, cY, size, 0, Math.PI*2); bCtx.fill();
        updateRenderCanvas();
    } else if (currentMode === 'decal') {
        const rot = parseInt(ui.decalRot.value);
        drawShape(bCtx, cX, cY, size*2, rot, ui.decalType.value, color);
        updateRenderCanvas();
    }
});

window.addEventListener('mouseup', () => isPainting = false);

// --- 7. Load Model ---
const loader = new THREE.GLTFLoader();
loader.load('scene.gltf', (gltf) => {
    const carModel = gltf.scene;
    
    carModel.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            
            const nodeIdentity = (node.name + (node.material ? node.material.name : '')).toLowerCase();
            const isProtected = nodeIdentity.includes('wheel') || nodeIdentity.includes('tire') || nodeIdentity.includes('tyre') || nodeIdentity.includes('glass') || nodeIdentity.includes('halo');

            if (!isProtected) {
                paintableMeshes.push(node); 
                if (node.material) {
                    node.material.map = canvasTexture;
                    node.material.roughness = 0.15;
                    node.material.metalness = 0.4;
                    node.material.needsUpdate = true;
                }
            }
        }
    });
    
    const box = new THREE.Box3().setFromObject(carModel);
    const center = box.getCenter(new THREE.Vector3());
    carModel.position.sub(center);
    controls.target.copy(center);
    controls.update();
    scene.add(carModel);
});

// --- 8. Core Loop ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);
    if (currentMode === 'camera') controls.update();
    renderer.render(scene, camera);
}
animate();