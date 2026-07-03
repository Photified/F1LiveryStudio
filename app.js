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

// --- 2. Action History (Undo Engine) ---
const actionHistory = []; 
const MAX_UNDO = 15;

function saveBucketState(mesh) {
    if (actionHistory.length >= MAX_UNDO) actionHistory.shift();
    actionHistory.push({ 
        type: 'bucket', 
        mesh: mesh,
        oldColor: mesh.material.color.getHex()
    });
}

function saveDecalState(decalGroups) {
    if (actionHistory.length >= MAX_UNDO) actionHistory.shift();
    actionHistory.push({ 
        type: 'decal', 
        groups: decalGroups 
    });
}

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

// --- 3. UI Elements ---
let currentMode = 'camera'; 
let isMirrorMode = false;
let paintableMeshes = []; 
let activeGhostMeshes = [];

const ui = {
    camera: document.getElementById('mode-camera'),
    bucket: document.getElementById('mode-bucket'),
    decal: document.getElementById('mode-decal'),
    color: document.getElementById('paintColor'),
    size: document.getElementById('toolSize'),
    decalWrap: document.getElementById('decal-select-wrap'),
    sizeWrap: document.getElementById('decal-size-wrap'),
    decalType: document.getElementById('decalType'),
    decalRot: document.getElementById('decalRot'),
    mirrorBtn: document.getElementById('mirrorBtn'),
    undoBtn: document.getElementById('undoBtn'),
    resetBtn: document.getElementById('resetBtn')
};

function setMode(mode) {
    currentMode = mode;
    ['camera', 'bucket', 'decal'].forEach(m => ui[m].classList.remove('active'));
    ui[mode].classList.add('active');
    
    ui.decalWrap.style.display = (mode === 'decal') ? 'flex' : 'none';
    ui.sizeWrap.style.display = (mode === 'decal') ? 'flex' : 'none';
    
    controls.enabled = (mode === 'camera');
    clearGhosts();
}

ui.camera.addEventListener('click', () => setMode('camera'));
ui.bucket.addEventListener('click', () => setMode('bucket'));
ui.decal.addEventListener('click', () => setMode('decal'));

ui.mirrorBtn.addEventListener('click', () => {
    isMirrorMode = !isMirrorMode;
    ui.mirrorBtn.classList.toggle('toggle-on');
    ui.mirrorBtn.innerText = isMirrorMode ? "🪞 Mirror: ON" : "🪞 Mirror: OFF";
});

ui.undoBtn.addEventListener('click', () => {
    if (actionHistory.length > 0) {
        const lastAction = actionHistory.pop();
        if (lastAction.type === 'bucket') {
            lastAction.mesh.material.color.setHex(lastAction.oldColor);
        } else if (lastAction.type === 'decal') {
            lastAction.groups.forEach(group => removeMeshHierarchy(group));
        }
    }
});

ui.resetBtn.addEventListener('click', () => {
    actionHistory.forEach(action => {
        if (action.type === 'decal') {
            action.groups.forEach(group => removeMeshHierarchy(group));
        }
    });
    actionHistory.length = 0;
    
    paintableMeshes.forEach(mesh => {
        if (mesh.material) {
            mesh.material.color.setHex(0xffffff);
        }
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
    dCanvas.width = 2048; dCanvas.height = 2048;
    drawShape(dCanvas.getContext('2d'), 1024, 1024, 960, type, color);

    const texture = new THREE.CanvasTexture(dCanvas);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // With the shell removed, decals only need a slight polygon offset from the base car
    const mat = new THREE.MeshStandardMaterial({
        map: texture, transparent: true, depthTest: true, depthWrite: false, 
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, 
        wireframe: false, roughness: 0.2
    });
    window.decalCache[key] = mat;
    return mat;
}

// --- 5. Projector & Raycast Engine ---
const raycaster = new THREE.Raycaster();
const mouseVector = new THREE.Vector2();

function getIntersection(e) {
    if (paintableMeshes.length === 0) return null;
    mouseVector.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVector.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouseVector, camera);
    const intersects = raycaster.intersectObjects(paintableMeshes, false);
    return intersects.length > 0 ? intersects[0] : null;
}

function applyDecal(hit, isGhost = false) {
    const position = hit.point;
    const normal = hit.face.normal.clone();

    const dummy = new THREE.Object3D();
    dummy.position.copy(position);
    
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    const worldNormal = normal.clone().applyMatrix3(normalMatrix).normalize();
    dummy.lookAt(position.clone().add(worldNormal));
    
    let rot = parseInt(ui.decalRot.value);
    dummy.rotateZ(rot * Math.PI / 180);

    const sizeVal = parseInt(ui.size.value) / 100;
    // Tighter projection depth prevents decals from shooting through the whole car
    const projectionDepth = Math.min(sizeVal * 0.5, 1.0); 
    const scale = new THREE.Vector3(sizeVal, sizeVal, projectionDepth);

    const decalMat = createDecalMaterial(ui.decalType.value, ui.color.value);
    const decalGroup = new THREE.Group(); 

    // Loop through ALL raw panels to ensure the decal spans across gaps smoothly
    paintableMeshes.forEach(mesh => {
        const decalGeo = new THREE.DecalGeometry(mesh, position, dummy.rotation, scale);
        
        if (decalGeo.attributes.position.count > 0) {
            const decalMesh = new THREE.Mesh(decalGeo, decalMat);
            if (isGhost) {
                decalMesh.material = decalMat.clone();
                decalMesh.material.opacity = 0.5;
            }
            decalMesh.receiveShadow = true; // Decals receive shadows but shouldn't cast them
            decalGroup.add(decalMesh);
        }
    });

    scene.add(decalGroup);
    return decalGroup;
}

function applyMirroredDecal(hit, isGhost = false) {
    const position = hit.point.clone();
    position.x = -position.x; 
    
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    worldNormal.x = -worldNormal.x; 
    
    const dummy = new THREE.Object3D();
    dummy.position.copy(position);
    dummy.lookAt(position.clone().add(worldNormal));
    
    let rot = -parseInt(ui.decalRot.value);
    dummy.rotateZ(rot * Math.PI / 180);

    const sizeVal = parseInt(ui.size.value) / 100;
    const projectionDepth = Math.min(sizeVal * 0.5, 1.0); 
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

window.addEventListener('mousemove', (e) => {
    if (currentMode === 'camera') return;
    
    clearGhosts();
    
    const hit = getIntersection(e);
    if (!hit) return;

    if (currentMode === 'decal') {
        activeGhostMeshes.push(applyDecal(hit, true));
        if (isMirrorMode) {
            activeGhostMeshes.push(applyMirroredDecal(hit, true));
        }
    }
});

window.addEventListener('mousedown', (e) => {
    if (currentMode === 'camera') return;
    const hit = getIntersection(e);
    if (!hit) return;

    if (currentMode === 'bucket') {
        saveBucketState(hit.object);
        hit.object.material.color.set(ui.color.value);
    } else if (currentMode === 'decal') {
        clearGhosts();
        const createdGroups = [];
        createdGroups.push(applyDecal(hit, false));
        if (isMirrorMode) {
            createdGroups.push(applyMirroredDecal(hit, false));
        }
        saveDecalState(createdGroups);
    }
});

// --- 6. Direct Mesh Loading System (WITH MATERIAL DICTIONARY FIX) ---
const loader = new THREE.GLTFLoader();
const materialCache = {}; // THE FIX: Cache materials so linked shards stay linked

loader.load('scene.gltf', (gltf) => {
    const carModel = gltf.scene;

    carModel.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true; 
            node.receiveShadow = true;
            const id = (node.name + (node.material ? node.material.name : '')).toLowerCase();
            
            if (!id.includes('wheel') && !id.includes('tire') && !id.includes('glass')) {
                
                // THE FIX: Group by original material name instead of isolating every node
                if (node.material) {
                    // Get the original name or ID of the material from the GLTF
                    const matKey = node.material.name || node.material.uuid;
                    
                    if (!materialCache[matKey]) {
                        // If we haven't seen this material yet, clone it and set default color
                        materialCache[matKey] = node.material.clone();
                        materialCache[matKey].color.setHex(0xffffff); 
                    }
                    
                    // Assign the shared, cached material to this node
                    node.material = materialCache[matKey];
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
    if (currentMode === 'camera') controls.update(); 
    renderer.render(scene, camera); 
}
animate();