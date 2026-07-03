// 1. Scene Setup
const container = document.getElementById('viewport3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#222222');

// 2. Camera Setup
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(5, 3, 5); // Position camera diagonally above the car

// 3. Renderer Setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// Enable shadows for realism
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// 4. Lighting Rig
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft white light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

const spotLight = new THREE.SpotLight(0xffffff, 0.5);
spotLight.position.set(-10, 10, -10);
scene.add(spotLight);

// 5. Orbit Controls (The magic that lets you pan and rotate)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Adds weight/smoothness to camera movement
controls.dampingFactor = 0.05;
controls.minDistance = 2; // Prevent zooming too far inside the car
controls.maxDistance = 15; // Prevent zooming too far out

// 6. Load the 3D F1 Car Model
let f1Car;
const loader = new THREE.GLTFLoader();

// Replace 'f1-car.glb' with the path to your actual 3D model file
loader.load('f1-car.glb', function(gltf) {
    f1Car = gltf.scene;
    
    // Center the car in the scene
    f1Car.position.set(0, 0, 0);
    
    // Enable shadows on the car
    f1Car.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            
            // Give it a default glossy paint material
            if(node.material) {
               node.material.roughness = 0.2; 
               node.material.metalness = 0.3;
            }
        }
    });

    scene.add(f1Car);
}, undefined, function(error) {
    console.error('Error loading 3D model. Make sure f1-car.glb is in the folder.', error);
});

// 7. Base Color Changer Logic
const colorPicker = document.getElementById('carColorPicker');
colorPicker.addEventListener('input', (e) => {
    if (f1Car) {
        // Find the main chassis mesh and change its color
        // Note: You may need to target a specific mesh name depending on your 3D model structure
        f1Car.traverse((node) => {
            if (node.isMesh && node.material) {
                node.material.color.set(e.target.value);
            }
        });
    }
});

// 8. Animation/Render Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Required if damping is enabled
    renderer.render(scene, camera);
}
animate();

// 9. Handle Window Resizing
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});