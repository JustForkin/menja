function draw(ctx, width, height, viewScale) {
	const halfW = width / 2;
	const halfH = height / 2;

	PERF_START('draw');

	// 3D Polys
	// ---------------

	PERF_START('drawShadows');
	ctx.fillStyle = shadowColor;
	allShadowPolys.forEach(p => {
		if (p.normalWorld.z < 0) return;
		ctx.beginPath();
		const { vertices } = p;
		const vCount = vertices.length;
		const firstV = vertices[0];
		ctx.moveTo(firstV.x, firstV.y);
		for (let i=1; i<vCount; i++) {
			const v = vertices[i];
			ctx.lineTo(v.x, v.y);
		}
		ctx.closePath();
		ctx.fill();
	});
	PERF_END('drawShadows');

	PERF_START('drawPolys');
	allPolys.forEach(p => {
		if (p.normalCamera.z < 0) return;

		const { vertices } = p;
		const lastV = vertices[vertices.length - 1];
		const normalLight = p.normalWorld.y * 0.7 + p.normalWorld.z * -0.7;
		const lightness = normalLight > 0
			? 10
			: ((normalLight ** 32 - normalLight) / 2) * 90 + 10;

		ctx.fillStyle = `hsl(${p.color.h},${p.color.s}%,${lightness}%)`;
		ctx.beginPath();
		ctx.moveTo(lastV.x, lastV.y);
		for (let v of vertices) {
			ctx.lineTo(v.x, v.y);
		}
		ctx.fill();
	});
	PERF_END('drawPolys');


	PERF_START('draw2D');

	// 2D Sparks
	// ---------------
	ctx.strokeStyle = sparkColor;
	ctx.lineWidth = sparkThickness;
	ctx.beginPath();
	sparks.forEach(spark => {
		ctx.moveTo(spark.x, spark.y);
		ctx.lineTo(spark.x - spark.xD, spark.y - spark.yD);

	});
	ctx.stroke();


	// Touch Strokes
	// ---------------

	ctx.strokeStyle = touchTrailColor;
	const touchPointCount = touchPoints.length;
	for (let i=1; i<touchPointCount; i++) {
		const current = touchPoints[i];
		const prev = touchPoints[i-1];
		if (current.touchBreak || prev.touchBreak) {
			continue;
		}
		const scale = current.life / touchPointLife;
		ctx.lineWidth = scale * touchTrailThickness;
		ctx.beginPath();
		ctx.moveTo(prev.x, prev.y);
		ctx.lineTo(current.x, current.y);
		ctx.stroke();
	}

	PERF_END('draw2D');

	PERF_END('draw');
	PERF_END('frame');

	// Display performance updates.
	PERF_UPDATE();
}
