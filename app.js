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
controls.target.set(0, -0.2, 0); 

// Dynamic Camera Distance based on screen width
function getCamDist() { return window.innerWidth < 800 ? 18 : 10; }

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
updateCameraTo('iso'); // Initial perspective

// --- 2. Base Canvas (For Brush) ---
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
const MAX_UNDO = 15;

function saveCanvasState() {
    if (actionHistory.length >= MAX_UNDO) actionHistory.shift();
    actionHistory.push({ type: 'brush', canvasData: bCtx.getImageData(0, 0, 2048, 2048) });
}

function saveBucketState(mesh) {
    if (actionHistory.length >= MAX_UNDO) actionHistory.shift();
    actionHistory.push({ type: 'bucket', mesh: mesh, oldColor: mesh.material.color.getHex() });
}

function saveDecalState(groups) {
    if (actionHistory.length >= MAX_UNDO) actionHistory.shift();
    actionHistory.push({ type: 'decal', groups: groups });
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
    clearGhosts();
    updateRenderCanvas(); 
}

ui.camera.addEventListener('click', () => setMode('camera'));
ui.brush.addEventListener('click', () => setMode('brush'));
ui.bucket.addEventListener('click', () => setMode('bucket'));
ui.decal.addEventListener('click', () => setMode('decal'));

ui.mirrorBtn.addEventListener('click', () => {
    isMirrorMode = !isMirrorMode;
    ui.mirrorBtn.classList.toggle('toggle-on');
    ui.mirrorBtn.innerText = isMirrorMode ? "🪞 Mirror: ON" : "🪞 Mirror: OFF";
});

function removeMeshHierarchy(obj) {
    if (!obj) return;
    if (obj.isGroup) {
        obj.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    } else {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    }
    scene.remove(obj);
}

ui.undoBtn.addEventListener('click', () => {
    if (actionHistory.length === 0) return;
    const lastAction = actionHistory.pop();
    
    if (lastAction.type === 'brush') {
        bCtx.putImageData(lastAction.canvasData, 0, 0);
        updateRenderCanvas();
    } else if (lastAction.type === 'bucket') {
        lastAction.mesh.material.color.setHex(lastAction.oldColor);
    } else if (lastAction.type === 'decal') {
        lastAction.groups.forEach(group => removeMeshHierarchy(group));
    }
});

ui.resetBtn.addEventListener('click', () => {
    saveCanvasState();
    bCtx.clearRect(0, 0, 2048, 2048);
    bCtx.drawImage(baseMapImage, 0, 0, 2048, 2048);
    updateRenderCanvas();
    
    actionHistory.forEach(action => {
        if (action.type === 'decal') action.groups.forEach(group => removeMeshHierarchy(group));
    });
    
    paintableMeshes.forEach(mesh => {
        if (mesh.material) mesh.material.color.setHex(0xffffff);
    });
});

document.querySelectorAll('.cam-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const view = e.target.getAttribute('data-cam');
        if (view === 'free') setMode('camera');
        else updateCameraTo(view);
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
    dCanvas.width = 2048; dCanvas.height = 2048;
    drawShape(dCanvas.getContext('2d'), 1024, 1024, 960, type, color);

    const texture = new THREE.CanvasTexture(dCanvas);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const mat = new THREE.MeshStandardMaterial({
        map: texture, transparent: true, depthTest: true, depthWrite: false, 
        polygonOffset: true, polygonOffsetFactor: -4, wireframe: false, roughness: 0.2
    });
    window.decalCache[key] = mat;
    return mat;
}

// --- 5. Projector & Raycast Engine (Mobile Native) ---
const raycaster = new THREE.Raycaster();
const mirrorRaycaster = new THREE.Raycaster();
const mouseVector = new THREE.Vector2();
const canvasEl = renderer.domElement;

function getIntersection(clientX, clientY) {
    if (paintableMeshes.length === 0) return null;
    const rect = canvasEl.getBoundingClientRect();
    mouseVector.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseVector.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    
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
    const dummy = new THREE.Object3D();
    dummy.position.copy(position);
    
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    dummy.lookAt(position.clone().add(worldNormal));
    
    let rot = parseInt(ui.decalRot.value);
    if (flipRotation) rot = -rot;
    dummy.rotateZ(rot * Math.PI / 180);

    const sizeVal = parseInt(ui.size.value) / 100;
    const projectionDepth = Math.min(sizeVal, 2.0); 
    const scale = new THREE.Vector3(sizeVal, sizeVal, projectionDepth);

    const decalMat = createDecalMaterial(ui.decalType.value, ui.color.value);
    const decalGroup = new THREE.Group(); 

    paintableMeshes.forEach(mesh => {
        const decalGeo = new THREE.DecalGeometry(mesh, position, dummy.rotation, scale);
        if (decalGeo.attributes.position.count > 0) {
            const decalMesh = new THREE.Mesh(decalGeo, decalMat);
            if (isGhost) {
                decalMesh.material = decalMat.clone();
                decalMesh.material.opacity = 0.5;
            }
            decalMesh.receiveShadow = true; 
            decalGroup.add(decalMesh);
        }
    });

    scene.add(decalGroup);
    return decalGroup;
}

function clearGhosts() {
    activeGhostMeshes.forEach(group => removeMeshHierarchy(group));
    activeGhostMeshes = [];
}

function executeBrush(hit) {
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
}

// TAP vs DRAG Logic Engine for Mobile
let pointerDownPos = new THREE.Vector2();
let isDragging = false;

canvasEl.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return; 
    
    pointerDownPos.set(e.clientX, e.clientY);
    isDragging = false;

    if (currentMode === 'brush') {
        controls.enabled = false; // Dragging paints
        const hit = getIntersection(e.clientX, e.clientY);
        if (hit && hit.uv) {
            isPainting = true;
            saveCanvasState();
            executeBrush(hit);
        }
    } else {
        controls.enabled = true; // Dragging orbits for Decal and Bucket
    }
});

canvasEl.addEventListener('pointermove', (e) => {
    if (!e.isPrimary) return;
    
    if (pointerDownPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 5) {
        isDragging = true;
    }

    if (e.pointerType === 'mouse' && currentMode === 'decal' && !isDragging) {
        clearGhosts();
        const hit = getIntersection(e.clientX, e.clientY);
        if (hit) {
            activeGhostMeshes.push(applyDecal(hit, true, false));
            if (isMirrorMode) {
                const mHit = getMirroredHit(hit);
                if (mHit) activeGhostMeshes.push(applyDecal(mHit, true, true));
            }
        }
    }

    if (currentMode === 'brush' && isPainting) {
        const hit = getIntersection(e.clientX, e.clientY);
        if (hit && hit.uv) executeBrush(hit);
    }
});

canvasEl.addEventListener('pointerup', (e) => {
    if (!e.isPrimary) return;
    
    if (currentMode === 'brush') {
        isPainting = false;
        controls.enabled = true; 
    } else if (!isDragging && currentMode !== 'camera') {
        // CLEAN TAP DETECTED - Execute Bucket or Decal
        const hit = getIntersection(e.clientX, e.clientY);
        if (!hit) return;

        if (currentMode === 'bucket') {
            saveBucketState(hit.object);
            hit.object.material.color.set(ui.color.value);
        } else if (currentMode === 'decal') {
            clearGhosts();
            const createdGroups = [];
            createdGroups.push(applyDecal(hit, false, false));
            if (isMirrorMode) {
                const mHit = getMirroredHit(hit);
                if (mHit) createdGroups.push(applyDecal(mHit, false, true));
            }
            saveDecalState(createdGroups);
        }
    }
});

// --- 6. Load Model with Parent Grouping ---
const loader = new THREE.GLTFLoader();
const materialCache = {}; 

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
                    
                    if (!materialCache[groupKey]) {
                        materialCache[groupKey] = node.material.clone();
                        materialCache[groupKey].color.setHex(0xffffff); 
                        materialCache[groupKey].map = canvasTexture; // Allows Brush to map over Bucket colors
                    }
                    
                    node.material = materialCache[groupKey];
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

// --- 7. Core Loop ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; 
    camera.updateProjectionMatrix(); 
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() { 
    requestAnimationFrame(animate); 
    if (controls.enabled) controls.update(); 
    renderer.render(scene, camera); 
}
animate();