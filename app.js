// --- 1. Scene, Camera, & Renderer Configuration ---
const container = document.getElementById('viewport3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1a1a');

// Zoomed the camera out so the whole car fits in the frame on load
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-8.5, 3.5, 8.5); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// --- 2. Advanced Lighting Setup ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const topLight = new THREE.DirectionalLight(0xffffff, 0.8);
topLight.position.set(0, 10, 0);
scene.add(topLight);

const sideLight1 = new THREE.PointLight(0xffffff, 0.5, 50);
sideLight1.position.set(5, 3, 5);
scene.add(sideLight1);

const sideLight2 = new THREE.PointLight(0xffffff, 0.5, 50);
sideLight2.position.set(-5, 3, -5);
scene.add(sideLight2);

// --- 3. Camera Controls ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- 4. Internal 2D Paint Processing Canvas ---
const paintCanvas = document.createElement('canvas');
paintCanvas.width = 2048;
paintCanvas.height = 2048;
const pCtx = paintCanvas.getContext('2d');

const canvasTexture = new THREE.CanvasTexture(paintCanvas);
canvasTexture.flipY = false;

const baseMapImage = new Image();
baseMapImage.src = 'textures/Livery_baseColor.png';
baseMapImage.onload = () => {
    pCtx.drawImage(baseMapImage, 0, 0, paintCanvas.width, paintCanvas.height);
    canvasTexture.needsUpdate = true;
};

// --- 5. UI Elements & State Tracking ---
let currentMode = 'camera'; 
let isPainting = false;
let paintableMeshes = []; // Stores only the chassis, protecting the tires

const modeCamera = document.getElementById('mode-camera');
const modeBrush = document.getElementById('mode-brush');
const modeBucket = document.getElementById('mode-bucket');
const modeDecal = document.getElementById('mode-decal');
const paintColor = document.getElementById('paintColor');
const toolSize = document.getElementById('toolSize');
const decalType = document.getElementById('decalType');
const decalSelectWrap = document.getElementById('decal-select-wrap');
const resetBtn = document.getElementById('resetBtn');

function setMode(mode) {
    currentMode = mode;
    [modeCamera, modeBrush, modeBucket, modeDecal].forEach(b => b.classList.remove('active'));
    decalSelectWrap.style.display = (mode === 'decal') ? 'flex' : 'none';
    controls.enabled = (mode === 'camera');
}

modeCamera.addEventListener('click', () => { setMode('camera'); modeCamera.classList.add('active'); });
modeBrush.addEventListener('click', () => { setMode('brush'); modeBrush.classList.add('active'); });
modeDecal.addEventListener('click', () => { setMode('decal'); modeDecal.classList.add('active'); });

// Instant Fill Bucket Tool
modeBucket.addEventListener('click', () => {
    pCtx.fillStyle = paintColor.value;
    pCtx.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
    canvasTexture.needsUpdate = true;
    
    paintableMeshes.forEach(mesh => {
        if (mesh.material) {
            mesh.material.map = canvasTexture;
            mesh.material.needsUpdate = true;
        }
    });
});

// --- 6. Load Your F1 Car Model ---
const loader = new THREE.GLTFLoader();
loader.load('scene.gltf', (gltf) => {
    const carModel = gltf.scene;
    
    carModel.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            
            // SMART FILTER: Check the name of the mesh and material to protect tires and glass
            const nodeIdentity = (node.name + (node.material ? node.material.name : '')).toLowerCase();
            const isProtected = nodeIdentity.includes('wheel') || 
                                nodeIdentity.includes('tire') || 
                                nodeIdentity.includes('tyre') || 
                                nodeIdentity.includes('glass') || 
                                nodeIdentity.includes('halo');

            if (!isProtected) {
                paintableMeshes.push(node); 
                
                // Assign the paint canvas ONLY to the car body
                if (node.material) {
                    node.material.map = canvasTexture;
                    node.material.roughness = 0.15;
                    node.material.metalness = 0.4;
                    node.material.needsUpdate = true;
                }
            }
        }
    });
    
    // Auto-center the car in the 3D world
    const box = new THREE.Box3().setFromObject(carModel);
    const center = box.getCenter(new THREE.Vector3());
    carModel.position.sub(center);
    
    controls.target.copy(center);
    controls.update();

    scene.add(carModel);
}, undefined, (err) => console.error("Error loading model files:", err));

// --- 7. Direct 3D Raycast Paint & Decal Processor ---
const raycaster = new THREE.Raycaster();
const mouseVector = new THREE.Vector2();

function projectDraw(e) {
    if (paintableMeshes.length === 0) return;

    mouseVector.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVector.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouseVector, camera);
    const intersects = raycaster.intersectObjects(paintableMeshes, true);

    if (intersects.length > 0) {
        const hit = intersects[0];
        
        if (hit.uv) {
            const canvasX = hit.uv.x * paintCanvas.width;
            const canvasY = hit.uv.y * paintCanvas.height;

            pCtx.save();
            pCtx.fillStyle = paintColor.value;
            pCtx.strokeStyle = paintColor.value;

            if (currentMode === 'brush') {
                pCtx.beginPath();
                pCtx.arc(canvasX, canvasY, toolSize.value, 0, Math.PI * 2);
                pCtx.fill();
            } else if (currentMode === 'decal') {
                const size = parseInt(toolSize.value) * 3;
                pCtx.translate(canvasX, canvasY);
                
                if (decalType.value === 'star') {
                    pCtx.beginPath();
                    for (let i = 0; i < 5; i++) {
                        pCtx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * size, -Math.sin((18 + i * 72) * Math.PI / 180) * size);
                        pCtx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * (size/2), -Math.sin((54 + i * 72) * Math.PI / 180) * (size/2));
                    }
                    pCtx.closePath();
                    pCtx.fill();
                } else if (decalType.value === 'stripe') {
                    pCtx.fillRect(-size / 4, -size * 1.5, size / 2, size * 3);
                } else if (decalType.value === 'circle') {
                    pCtx.beginPath();
                    pCtx.arc(0, 0, size, 0, Math.PI * 2);
                    pCtx.fill();
                }
                
                setMode('camera'); 
                modeCamera.classList.add('active');
            }

            pCtx.restore();
            canvasTexture.needsUpdate = true; 
        }
    }
}

// --- 8. Event Coordination Layer ---
window.addEventListener('mousedown', (e) => {
    if (currentMode === 'camera') return;
    isPainting = true;
    projectDraw(e);
});

window.addEventListener('mousemove', (e) => {
    if (!isPainting || currentMode !== 'brush') return;
    projectDraw(e);
});

window.addEventListener('mouseup', () => isPainting = false);

resetBtn.addEventListener('click', () => {
    pCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    pCtx.drawImage(baseMapImage, 0, 0, paintCanvas.width, paintCanvas.height);
    canvasTexture.needsUpdate = true;
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 9. Core Engine Frame Loop ---
function animate() {
    requestAnimationFrame(animate);
    if (currentMode === 'camera') controls.update();
    renderer.render(scene, camera);
}
animate();