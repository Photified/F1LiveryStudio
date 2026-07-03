// --- 1. Scene, Camera, & Renderer ---
const container = document.getElementById('viewport3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1a1a');

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(10, 0.5, 0); 

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
controls.target.set(0, -0.2, 0); 

// --- 2. Base Canvas (For Brush/Bucket Skins) ---
const baseCanvas = document.createElement('canvas');
baseCanvas.width = 2048; baseCanvas.height = 2048;
const bCtx = baseCanvas.getContext('2d');

const renderCanvas = document.createElement('canvas');
renderCanvas.width = 2048; renderCanvas.height = 2048;
const rCtx = renderCanvas.getContext('2d');

const canvasTexture = new THREE.CanvasTexture(renderCanvas);
canvasTexture.flipY = false;

// --- Unified Undo History Stack ---
const actionHistory = []; 
const MAX_UNDO = 10;

function saveState() {
    if (actionHistory.length >= MAX_UNDO) actionHistory.shift();
    actionHistory.push({ 
        type: 'state', 
        canvasData: bCtx.getImageData(0, 0, 2048, 2048),
        meshes: [] 
    });
}

function registerMeshesToLastState(meshes) {
    if (actionHistory.length > 0) {
        actionHistory[actionHistory.length - 1].meshes.push(...meshes);
    }
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

// --- 3. UI Elements ---
let currentMode = 'camera'; 
let isPainting = false;
let isMirrorMode = false;
let paintableMeshes = []; 
let activeGhostMeshes = [];

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
    mirrorBtn: document.getElementById('mirrorBtn'),
    undoBtn: document.getElementById('undoBtn'),
    resetBtn: document.getElementById('resetBtn')
};

function setMode(mode) {
    currentMode = mode;
    ['camera', 'brush', 'bucket', 'decal'].forEach(m => ui[m].classList.remove('active'));
    ui[mode].classList.add('active');
    ui.decalWrap.style.display = (mode === 'decal') ? 'flex' : 'none';
    controls.enabled = (mode === 'camera');
    clearGhosts();
    updateRenderCanvas(); 
}

ui.camera.addEventListener('click', () => setMode('camera'));
ui.brush.addEventListener('click', () => setMode('brush'));
ui.decal.addEventListener('click', () => setMode('decal'));

ui.mirrorBtn.addEventListener('click', () => {
    isMirrorMode = !isMirrorMode;
    ui.mirrorBtn.classList.toggle('toggle-on');
    ui.mirrorBtn.innerText = isMirrorMode ? "🪞 Mirror: ON" : "🪞 Mirror: OFF";
});

ui.bucket.addEventListener('click', () => {
    saveState();
    bCtx.fillStyle = ui.color.value;
    bCtx.fillRect(0, 0, 2048, 2048);
    updateRenderCanvas();
});

ui.undoBtn.addEventListener('click', () => {
    if (actionHistory.length > 0) {
        const lastAction = actionHistory.pop();
        bCtx.putImageData(lastAction.canvasData, 0, 0);
        updateRenderCanvas();
        lastAction.meshes.forEach(mesh => {
            scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
    }
});

ui.resetBtn.addEventListener('click', () => {
    saveState();
    bCtx.clearRect(0, 0, 2048, 2048);
    bCtx.drawImage(baseMapImage, 0, 0, 2048, 2048);
    updateRenderCanvas();
    actionHistory.forEach(action => {
        action.meshes.forEach(mesh => {
            scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        action.meshes = [];
    });
});

const camViews = {
    side: new THREE.Vector3(10, 0.5, 0),
    front: new THREE.Vector3(0, 0.5, 10),
    back: new THREE.Vector3(0, 0.5, -10),
    top: new THREE.Vector3(0, 10, 0),
    iso: new THREE.Vector3(-7, 5, 7)
};
document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const view = e.target.getAttribute('data-cam');
        if (view === 'free') return setMode('camera');
        if (camViews[view]) {
            camera.position.copy(camViews[view]);
            camera.lookAt(0, -0.2, 0);
            controls.target.set(0, -0.2, 0);
            controls.update();
        }
    });
});

// --- 4. 2D Geometry Drawer ---
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
        ctx.font = `bold ${size*2}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText("1", 0, 0);
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
    }
    ctx.restore();
}

function createDecalMaterial(type, color) {
    const key = type + color;
    if (window.decalCache && window.decalCache[key]) return window.decalCache[key];
    if (!window.decalCache) window.decalCache = {};

    const dCanvas = document.createElement('canvas');
    // MASSIVE UPGRADE: 2048x2048 resolution for razor sharp decals at extreme scale
    dCanvas.width = 2048; dCanvas.height = 2048;
    drawShape(dCanvas.getContext('2d'), 1024, 1024, 960, type, color);

    const texture = new THREE.CanvasTexture(dCanvas);
    // Anisotropic filtering prevents the decal from blurring when viewed at an angle
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const mat = new THREE.MeshStandardMaterial({
        map: texture, transparent: true, depthTest: true, depthWrite: false, 
        polygonOffset: true, polygonOffsetFactor: -4, wireframe: false, roughness: 0.2
    });
    window.decalCache[key] = mat;
    return mat;
}

// --- 5. Projector & Raycast Engine ---
const raycaster = new THREE.Raycaster();
const mirrorRaycaster = new THREE.Raycaster();
const mouseVector = new THREE.Vector2();

function getIntersection(e) {
    if (paintableMeshes.length === 0) return null;
    mouseVector.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVector.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouseVector, camera);
    const intersects = raycaster.intersectObjects(paintableMeshes, true);
    return intersects.length > 0 ? intersects[0] : null;
}

function getMirroredHit(hit) {
    const mirroredPoint = hit.point.clone();
    mirroredPoint.x = -mirroredPoint.x; 
    
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    const mirroredNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    mirroredNormal.x = -mirroredNormal.x;

    const origin = mirroredPoint.clone().add(mirroredNormal.clone().multiplyScalar(0.5));
    const direction = mirroredNormal.clone().negate();
    
    mirrorRaycaster.set(origin, direction);
    const mIntersects = mirrorRaycaster.intersectObjects(paintableMeshes, true);
    return mIntersects.length > 0 ? mIntersects[0] : null;
}

function applyDecal(hit, isGhost = false, flipRotation = false) {
    const position = hit.point;
    const normal = hit.face.normal.clone();

    const dummy = new THREE.Object3D();
    dummy.position.copy(position);
    
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    const worldNormal = normal.clone().applyMatrix3(normalMatrix).normalize();
    
    dummy.lookAt(position.clone().add(worldNormal));
    
    let rot = parseInt(ui.decalRot.value);
    if (flipRotation) rot = -rot;
    dummy.rotateZ(rot * Math.PI / 180);

    const sizeVal = parseInt(ui.size.value) / 100;
    
    // CAPPED PROJECTION DEPTH: 
    // Limits the Z-axis laser so it doesn't punch entirely through the car to the other side
    const projectionDepth = Math.min(sizeVal, 2.0); 
    const scale = new THREE.Vector3(sizeVal, sizeVal, projectionDepth);

    const decalGeo = new THREE.DecalGeometry(hit.object, position, dummy.rotation, scale);
    const decalMat = createDecalMaterial(ui.decalType.value, ui.color.value);
    
    if (isGhost) {
        const ghostMat = decalMat.clone();
        ghostMat.opacity = 0.5;
        const ghostMesh = new THREE.Mesh(decalGeo, ghostMat);
        scene.add(ghostMesh);
        return ghostMesh; 
    } else {
        const decalMesh = new THREE.Mesh(decalGeo, decalMat);
        scene.add(decalMesh);
        return decalMesh;
    }
}

function clearGhosts() {
    activeGhostMeshes.forEach(mesh => scene.remove(mesh));
    activeGhostMeshes = [];
}

// Hover Logic
window.addEventListener('mousemove', (e) => {
    if (currentMode === 'camera') return;
    
    clearGhosts();
    
    const hit = getIntersection(e);
    if (!hit) {
        if (!isPainting) updateRenderCanvas();
        return;
    }

    if (currentMode === 'brush') {
        if (isPainting && hit.uv) {
            const cX = hit.uv.x * 2048; const cY = hit.uv.y * 2048;
            bCtx.fillStyle = ui.color.value; bCtx.beginPath(); bCtx.arc(cX, cY, parseInt(ui.size.value)/5, 0, Math.PI*2); bCtx.fill();
            
            if (isMirrorMode) {
                const mHit = getMirroredHit(hit);
                if (mHit && mHit.uv) {
                    const mx = mHit.uv.x * 2048; const my = mHit.uv.y * 2048;
                    bCtx.beginPath(); bCtx.arc(mx, my, parseInt(ui.size.value)/5, 0, Math.PI*2); bCtx.fill();
                }
            }
            updateRenderCanvas();
        } else if (!isPainting) {
            updateRenderCanvas((ctx) => {
                if (hit.uv) {
                    ctx.fillStyle = ui.color.value; ctx.beginPath(); ctx.arc(hit.uv.x * 2048, hit.uv.y * 2048, parseInt(ui.size.value)/5, 0, Math.PI*2); ctx.fill();
                }
                if (isMirrorMode) {
                    const mHit = getMirroredHit(hit);
                    if (mHit && mHit.uv) {
                        ctx.beginPath(); ctx.arc(mHit.uv.x * 2048, mHit.uv.y * 2048, parseInt(ui.size.value)/5, 0, Math.PI*2); ctx.fill();
                    }
                }
            });
        }
    } else if (currentMode === 'decal' && !isPainting) {
        activeGhostMeshes.push(applyDecal(hit, true, false));
        if (isMirrorMode) {
            const mHit = getMirroredHit(hit);
            if (mHit) activeGhostMeshes.push(applyDecal(mHit, true, true));
        }
    }
});

// Commit Logic
window.addEventListener('mousedown', (e) => {
    if (currentMode === 'camera') return;
    const hit = getIntersection(e);
    if (!hit) return;

    saveState();
    const createdMeshes = [];

    if (currentMode === 'brush' && hit.uv) {
        isPainting = true;
        const cX = hit.uv.x * 2048; const cY = hit.uv.y * 2048;
        bCtx.fillStyle = ui.color.value; bCtx.beginPath(); bCtx.arc(cX, cY, parseInt(ui.size.value)/5, 0, Math.PI*2); bCtx.fill();
        
        if (isMirrorMode) {
            const mHit = getMirroredHit(hit);
            if (mHit && mHit.uv) {
                const mx = mHit.uv.x * 2048; const my = mHit.uv.y * 2048;
                bCtx.beginPath(); bCtx.arc(mx, my, parseInt(ui.size.value)/5, 0, Math.PI*2); bCtx.fill();
            }
        }
        updateRenderCanvas();
    } else if (currentMode === 'decal') {
        clearGhosts();
        createdMeshes.push(applyDecal(hit, false, false));
        if (isMirrorMode) {
            const mHit = getMirroredHit(hit);
            if (mHit) createdMeshes.push(applyDecal(mHit, false, true));
        }
        registerMeshesToLastState(createdMeshes);
    }
});

window.addEventListener('mouseup', () => isPainting = false);

// --- 6. Load Model ---
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
                    node.material.map = canvasTexture; node.material.needsUpdate = true;
                }
            }
        }
    });
    const box = new THREE.Box3().setFromObject(carModel);
    carModel.position.sub(box.getCenter(new THREE.Vector3()));
    scene.add(carModel);
});

// --- 7. Core Loop ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
});
function animate() { requestAnimationFrame(animate); if (currentMode === 'camera') controls.update(); renderer.render(scene, camera); }
animate();