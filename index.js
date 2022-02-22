import * as THREE from 'three';
import metaversefile from 'metaversefile';
const {useApp, useFrame, useActivate, useWear, useUse, useLocalPlayer, usePhysics, useScene, getNextInstanceId, getAppByPhysicsId, useWorld, useDefaultModules, useCleanup} = metaversefile;

const baseUrl = import.meta.url.replace(/(\/)[^\/\\]*$/, '$1');

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localVector4 = new THREE.Vector3();
// const localVector5 = new THREE.Vector3();
// const localVector6 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localQuaternion2 = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();

const zeroVector = new THREE.Vector3(0, 0, 0);
const upVector = new THREE.Vector3(0, 1, 0);
const yN90Quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI/2);
const y180Quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const smallUpQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.03*Math.PI);
const gravity = new THREE.Vector3(0, -9.8, 0);
const emptyArray = [];
const fnEmptyArray = () => emptyArray;
const arrowLength = 0.3;
const bowUseTime = 850;

const _setQuaternionFromVelocity = (quaternion, velocity) => quaternion.setFromRotationMatrix(
  localMatrix.lookAt(
    zeroVector,
    velocity,
    upVector
  )
);

export default e => {
  const app = useApp();
  app.name = 'bow';

  const physics = usePhysics();
  const scene = useScene();

  let bowApp = null;
  let pendingArrowApp = null;
  let shootingArrowApp = null;
  let arrowApps = [];
  e.waitUntil((async () => {
    {
      let u2 = `${baseUrl}bow.glb`;
      const m = await metaversefile.import(u2);
      bowApp = metaversefile.createApp({
        name: u2,
      });
      bowApp.position.copy(app.position);
      bowApp.quaternion.copy(app.quaternion);
      bowApp.scale.copy(app.scale);
      bowApp.updateMatrixWorld();
      bowApp.name = 'bow';
      bowApp.getPhysicsObjectsOriginal = bowApp.getPhysicsObjects;
      bowApp.getPhysicsObjects = fnEmptyArray;
      
      const components = [
        {
          "key": "instanceId",
          "value": getNextInstanceId(),
        },
        {
          "key": "contentId",
          "value": u2,
        },
        {
          "key": "physics",
          "value": true,
        },
        {
          "key": "wear",
          "value": {
            "boneAttachment": "rightHand",
            "position": [0, 0, 0],
            "quaternion": [0.5, -0.4999999999999999, -0.5, 0.5000000000000001],
            "scale": [1, 1, 1]
          }
        },
        {
          "key": "aim",
          "value": {}
        },
        {
          "key": "use",
          "value": {
            "animationEnvelope": [
              "bowDraw",
              "bowIdle",
              "bowLoose"
            ],
            "ik": "bow"
          }
        }
      ];
      
      for (const {key, value} of components) {
        bowApp.setComponent(key, value);
      }
      await bowApp.addModule(m);
      scene.add(bowApp);

      const arrowTemplateMesh = bowApp.getObjectByName('Arrow');
      arrowTemplateMesh.parent.remove(arrowTemplateMesh);

      const _createArrowApp = () => {
        const arrowApp = metaversefile.createApp({
          name: 'arrow',
        });

        const arrowMesh = arrowTemplateMesh.clone();
        arrowMesh.frustumCulled = false;
        arrowApp.add(arrowMesh);

        const tip = new THREE.Object3D();
        tip.position.set(0, 0, -arrowLength/2);
        arrowApp.add(tip);
        arrowApp.tip = tip;

        // arrowApp.savedQuaternion = new THREE.Quaternion();
        arrowApp.velocity = new THREE.Vector3();
        
        arrowApp.updatePhysics = (timestamp, timeDiff) => {
          const timeDiffS = timeDiff / 1000;

          const moveDistance = arrowApp.velocity.length() * timeDiffS;
          arrowApp.tip.matrixWorld.decompose(localVector, localQuaternion, localVector2);
          const collision = physics.raycast(
            localVector,
            localQuaternion
          );
          const collided = collision && collision.distance <= moveDistance;

          _setQuaternionFromVelocity(arrowApp.quaternion, arrowApp.velocity);
          const normalizedVelocity = localVector3.copy(arrowApp.velocity)
            .normalize();

          let moveFactor;
          if (collided) {
            moveFactor = collision.distance;
            arrowApp.velocity.setScalar(0);
          } else {
            moveFactor = moveDistance;
            arrowApp.velocity.add(
              localVector4.copy(gravity)
                .multiplyScalar(timeDiffS)
            );
          }
          arrowApp.position.add(
            localVector4.copy(normalizedVelocity)
              .multiplyScalar(moveFactor)
          );

          arrowApp.updateMatrixWorld();

          return !collided;
        };

        return arrowApp;
      };

      bowApp.use = e => {
        // console.log('got use', e);
        pendingArrowApp = _createArrowApp();
        scene.add(pendingArrowApp);
        
        /* pendingArrowApp.position.copy(bowApp.position);
        pendingArrowApp.quaternion.copy(bowApp.quaternion);
        pendingArrowApp.updateMatrixWorld(); */
      };
      bowApp.unuse = e => {
        // console.log('got use', e);
        // const arrowApp = _createArrowApp();
        
        /* arrowApp.position.copy(bowApp.position);
        _setQuaternionFromVelocity(arrowApp.quaternion, arrowApp.velocity);
        arrowApp.updateMatrixWorld(); */

        const localPlayer = useLocalPlayer();
        const timestamp = performance.now();

        const timeDiff = timestamp - localPlayer.characterPhysics.lastBowUseStartTime;
        if (timeDiff >= bowUseTime) {
          pendingArrowApp.velocity.set(0, 0, -20)
            .applyQuaternion(
              pendingArrowApp.quaternion
            );
        } else {
          pendingArrowApp.velocity.setScalar(0);
        }

        shootingArrowApp = pendingArrowApp;
        pendingArrowApp = null;
      };
    }
  })());
  
  app.getPhysicsObjects = () => {
    return bowApp ? bowApp.getPhysicsObjectsOriginal() : [];
  };
  
  useActivate(() => {
    const localPlayer = useLocalPlayer();
    localPlayer.wear(app);
  });
  
  let wearing = false;
  useWear(e => {
    const {wear} = e;
    if (bowApp) {
      /* bowApp.position.copy(app.position);
      bowApp.scale.copy(app.scale);
      bowApp.updateMatrixWorld(); */
      
      bowApp.dispatchEvent({
        type: 'wearupdate',
        wear,
      });
    }
    wearing = wear;
  });
  
  useUse(e => {
    if (bowApp) {
      if (e.use) {
        bowApp.use(e);
      } else {
        bowApp.unuse(e);
      }
    }
  });

  useFrame(({timestamp, timeDiff}) => {
    const localPlayer = useLocalPlayer();
    
    if (!wearing) {
      if (bowApp) {
        bowApp.position.copy(app.position);
        bowApp.quaternion.copy(app.quaternion);
        bowApp.updateMatrixWorld();
      }
    } else {
      if (bowApp) {
        app.position.copy(bowApp.position);
        app.quaternion.copy(bowApp.quaternion);
        app.updateMatrixWorld();
      }
    }

    {
      const arrowApp = pendingArrowApp;
      if (arrowApp) {
        const modelBones = localPlayer.avatar.modelBones;
        const {/*Root, */Left_wrist, Right_wrist} = modelBones;
        Left_wrist.matrixWorld.decompose(localVector, localQuaternion, localVector2);
        Right_wrist.matrixWorld.decompose(localVector3, localQuaternion2, localVector4);

        localQuaternion.multiply(yN90Quaternion);
        localQuaternion2.multiply(yN90Quaternion);

        const timeDiff = timestamp - localPlayer.characterPhysics.lastBowUseStartTime;
        if (timeDiff < bowUseTime) {
          localQuaternion2.multiply(y180Quaternion);
          arrowApp.position.copy(localVector3)
            .add(localVector4.set(0, 0, -arrowLength).applyQuaternion(localQuaternion2));
          arrowApp.quaternion.copy(localQuaternion2);
        } else {
          localQuaternion.setFromRotationMatrix(
            localMatrix.lookAt(
              localVector3,
              localVector,
              localVector2.set(0, 1, 0)
            )
          ).multiply(smallUpQuaternion);
          arrowApp.position.copy(localVector)
            .add(localVector2.set(0, 0.1, 0.1).applyQuaternion(localQuaternion));
          arrowApp.quaternion.copy(localQuaternion);
        }
        arrowApp.updateMatrixWorld();
      }
    }
    if (shootingArrowApp) {
      arrowApps.push(shootingArrowApp);
      shootingArrowApp = null;
    }
    arrowApps = arrowApps.filter(arrowApp => arrowApp.updatePhysics(timestamp, timeDiff));
  });
  
  useCleanup(() => {
    scene.remove(bowApp);
  });

  return app;
};