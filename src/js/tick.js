
let spawnTime = 0;
const spawnDelay = 1000;
const maxSpawnX = 450;
const targets = [];
const pointerDelta = { x: 0, y: 0 };
const pointerDeltaScaled = { x: 0, y: 0 };


function tick(width, height, simTime, simSpeed, lag) {
	PERF_START('frame');
	PERF_START('tick');

	const centerX = width / 2;
	const centerY = height / 2;

	const simAirDrag = 1 - (airDrag * simSpeed);
	const simAirDragSpark = 1 - (airDragSpark * simSpeed);

	// Pointer Tracking
	// -------------------

	// Compute speed and x/y deltas.
	// There is also a "scaled" variant taking game speed into account. This serves two purposes:
	//  - Lag won't create large spikes in speed/deltas
	//  - In slow mo, speed is increased proportionately to match "reality". Without this boost,
	//    it feels like your actions are dampened in slow mo.
	const forceMultiplier = 1 / (simSpeed * 0.75 + 0.25);
	pointerDelta.x = 0;
	pointerDelta.y = 0;
	pointerDeltaScaled.x = 0;
	pointerDeltaScaled.y = 0;
	const lastPointer = touchPoints[touchPoints.length - 1];

	if (pointerIsDown && lastPointer && !lastPointer.touchBreak) {
		pointerDelta.x = (pointerScene.x - lastPointer.x);
		pointerDelta.y = (pointerScene.y - lastPointer.y);
		pointerDeltaScaled.x = pointerDelta.x * forceMultiplier;
		pointerDeltaScaled.y = pointerDelta.y * forceMultiplier;
	}
	const pointerSpeed = Math.hypot(pointerDelta.x, pointerDelta.y);
	const pointerSpeedScaled = pointerSpeed * forceMultiplier;

	// Track points for later calculations, including drawing trail.
	touchPoints.forEach(p => p.life -= simTime);

	if (pointerIsDown) {
		touchPoints.push({
			x: pointerScene.x,
			y: pointerScene.y,
			life: touchPointLife
		});
	}

	while (touchPoints[0] && touchPoints[0].life <= 0) {
		touchPoints.shift();
	}


	// Entity Manipulation
	// --------------------
	PERF_START('entities');

	// Spawn targets
	spawnTime -= simTime;
	if (spawnTime <= 0) {
		spawnTime = spawnDelay;
		const target = getTarget();
		const spawnRadius = Math.min(centerX * 0.8, maxSpawnX);
		target.x = (Math.random() * spawnRadius * 2 - spawnRadius);
		target.y = centerY + targetHitRadius;
		target.z = (Math.random() * targetRadius*2 - targetRadius);
		target.xD = Math.random() * (target.x * -2 / 120);
		target.yD = -20;
		targets.push(target);
	}

	// Animate targets and remove when offscreen
	const leftBound = -centerX + targetRadius;
	const rightBound = centerX - targetRadius;
	const ceiling = -centerY - 200;
	const boundDamping = 0.4;

	targetLoop:
	for (let i = targets.length - 1; i >= 0; i--) {
		const target = targets[i];
		target.x += target.xD * simSpeed;
		target.y += target.yD * simSpeed;

		if (target.y < ceiling) {
			target.y = ceiling;
			const maxReboundSpeed = 3;
			target.yD = Math.min(maxReboundSpeed, -target.yD);
		}

		if (target.x < leftBound) {
			target.x = leftBound;
			target.xD *= -boundDamping;
		} else if (target.x > rightBound) {
			target.x = rightBound;
			target.xD *= -boundDamping;
		}

		if (target.z < backboardZ) {
			target.z = backboardZ;
			target.zD *= -boundDamping;
		}

		target.yD += gravity * simSpeed;
		target.rotateX += target.rotateXD * simSpeed;
		target.rotateY += target.rotateYD * simSpeed;
		target.rotateZ += target.rotateZD * simSpeed;
		target.transform();
		target.project();

		// Remove if offscreen
		if (target.projected.y > centerY + targetHitRadius * 2) {
			targets.splice(i, 1);
			returnTarget(target);
			updateScore(-50);
			continue;
		}


		if (pointerSpeedScaled > minPointerSpeed) {
			// If pointer is moving really fast, we want to hittest multiple points along the path.
			// We can't use scaled pointer speed to determine this, since we care about actual screen
			// distance covered.
			const hitTestCount = Math.ceil(pointerSpeed / targetRadius * 2);
			// Start loop at `1` and use `<=` check, so we skip 0% and end up at 100%.
			// This omits the previous point position, and includes the most recent.
			for (let ii=1; ii<=hitTestCount; ii++) {
				const percent = 1 - (ii / hitTestCount);
				const hitX = pointerScene.x - pointerDelta.x * percent;
				const hitY = pointerScene.y - pointerDelta.y * percent;
				const distance = Math.hypot(
					hitX - target.projected.x,
					hitY - target.projected.y
				);

				if (distance <= targetHitRadius) {
					// Hit! (though we don't want to allow hits on multiple sequential frames)
					if (!target.hit) {
						target.hit = true;
						target.health--;
						updateScore(10);
						target.xD += pointerDeltaScaled.x * hitDampening;
						target.yD += pointerDeltaScaled.y * hitDampening;
						target.rotateXD += pointerDeltaScaled.y * 0.001;
						target.rotateYD += pointerDeltaScaled.x * 0.001;

						if (target.health <= 0) {
							createBurst(target, forceMultiplier);
							sparkBurst(hitX, hitY, 3, 7+pointerSpeedScaled*0.125);
							targets.splice(i, 1);
							returnTarget(target);
						} else {
							sparkBurst(hitX, hitY, 8, 7+pointerSpeedScaled*0.125);
						}

					}
					// Break the current loop and continue the outer loop.
					// This skips to processing the next target.
					continue targetLoop;
				}
			}
		}

		// This code will only run if target hasn't been "hit".
		target.hit = false;
	}

	// Animate fragments and remove when offscreen.
	const fragBackboardZ = backboardZ + fragRadius;
	// Allow fragments to move off-screen to sides for a while, since shadows are still visible.
	const fragLeftBound = -width;
	const fragRightBound = width;

	for (let i = cubes.length - 1; i >= 0; i--) {
		const cube = cubes[i];
		cube.x += cube.xD * simSpeed;
		cube.y += cube.yD * simSpeed;
		cube.z += cube.zD * simSpeed;

		cube.xD *= simAirDrag;
		cube.yD *= simAirDrag;
		cube.zD *= simAirDrag;

		if (cube.y < ceiling) {
			cube.y = ceiling;
			cube.yD = 2;
		}

		if (cube.z < fragBackboardZ) {
			cube.z = fragBackboardZ;
			cube.zD *= -boundDamping;
		}

		cube.yD += gravity * simSpeed;
		cube.rotateX += cube.rotateXD * simSpeed;
		cube.rotateY += cube.rotateYD * simSpeed;
		cube.rotateZ += cube.rotateZD * simSpeed;
		cube.transform();
		cube.project();

		// Removal conditions
		if (
			// Bottom of screen
			cube.projected.y > centerY + targetHitRadius ||
			// Sides of screen
			cube.projected.x < fragLeftBound ||
			cube.projected.x > fragRightBound ||
			// Too close to camera (based on a percentage and constant value)
			cube.projected.z > 0.8*cameraDistance - 5*targetRadius
		) {
			cubes.splice(i, 1);
			returnCube(cube);
			continue;
		}
	}

	// 2D sparks
	for (let i = sparks.length - 1; i >= 0; i--) {
		const spark = sparks[i];
		spark.life -= simTime;
		if (spark.life < 0) {
			sparks.splice(i, 1);
			returnSpark(spark);
			continue;
		}
		spark.x += spark.xD * simSpeed;
		spark.y += spark.yD * simSpeed;
		spark.xD *= simAirDragSpark;
		spark.yD *= simAirDragSpark;
		spark.yD += gravity * simSpeed;
	}

	PERF_END('entities');

	// 3D transforms
	// -------------------

	PERF_START('3D');

	// Aggregate all scene vertices/polys
	allVertices.length = 0;
	allPolys.length = 0;
	allShadowVertices.length = 0;
	allShadowPolys.length = 0;
	targets.forEach(entity => {
		allVertices.push(...entity.vertices);
		allPolys.push(...entity.polys);
		allShadowVertices.push(...entity.shadowVertices);
		allShadowPolys.push(...entity.shadowPolys);
	});

	cubes.forEach(entity => {
		allVertices.push(...entity.vertices);
		allPolys.push(...entity.polys);
		allShadowVertices.push(...entity.shadowVertices);
		allShadowPolys.push(...entity.shadowPolys);
	});

	// Scene calculations/transformations
	allPolys.forEach(p => computePolyNormal(p, 'normalWorld'));
	allPolys.forEach(computePolyDepth);
	allPolys.sort((a, b) => b.depth - a.depth);

	// Perspective projection
	allVertices.forEach(projectVertex);

	allPolys.forEach(p => computePolyNormal(p, 'normalCamera'));

	PERF_END('3D');

	PERF_START('shadows');

	// Rotate shadow vertices to light source perspective
	transformVertices(
		allShadowVertices,
		allShadowVertices,
		0, 0, 0,
		TAU/8, 0, 0,
		1, 1, 1
	);

	allShadowPolys.forEach(p => computePolyNormal(p, 'normalWorld'));

	const shadowDistanceMult = Math.hypot(1, 1);
	const shadowVerticesLength = allShadowVertices.length;
	for (let i=0; i<shadowVerticesLength; i++) {
		const distance = allVertices[i].z - backboardZ;
		allShadowVertices[i].z -= shadowDistanceMult * distance;
	}
	transformVertices(
		allShadowVertices,
		allShadowVertices,
		0, 0, 0,
		-TAU/8, 0, 0,
		1, 1, 1
	);
	allShadowVertices.forEach(projectVertex);

	PERF_END('shadows');

	PERF_END('tick');
}
