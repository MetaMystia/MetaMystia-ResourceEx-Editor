import type { IDayMapNativeCollider } from '@/domain/resourcePack/contracts/dayMap';

/** 原生碰撞只画轮廓：相机青色、触发器黄色、实体红色。 */
export function drawNativeColliders(
	context: CanvasRenderingContext2D,
	colliders: readonly IDayMapNativeCollider[],
	px: (x: number) => number,
	py: (y: number) => number,
	scale: number,
	isEmphasized: boolean
) {
	if (colliders.length === 0) return;
	context.save();
	context.globalAlpha = isEmphasized ? 0.95 : 0.45;
	for (const collider of colliders) {
		if (!collider.active || !collider.enabled || collider.usedByComposite)
			continue;
		const m = collider.matrix;
		context.save();
		context.strokeStyle = collider.camera
			? '#22d3ee'
			: collider.isTrigger
				? '#facc15'
				: '#f87171';
		context.lineWidth = (isEmphasized ? 1.5 : 1) / scale;
		if (collider.isTrigger || collider.camera)
			context.setLineDash([4 / scale, 3 / scale]);
		context.transform(
			(m[0] ?? 1) * scale,
			-(m[4] ?? 0) * scale,
			(m[1] ?? 0) * scale,
			-(m[5] ?? 1) * scale,
			px(m[3] ?? 0),
			py(m[7] ?? 0)
		);
		context.translate(collider.offset[0] ?? 0, collider.offset[1] ?? 0);
		context.beginPath();
		if (collider.type === 'CircleCollider2D')
			context.arc(0, 0, collider.radius ?? 0, 0, Math.PI * 2);
		else if (collider.type === 'BoxCollider2D') {
			const [w = 0, h = 0] = collider.size ?? [];
			context.roundRect(-w / 2, -h / 2, w, h, collider.edgeRadius ?? 0);
		} else {
			for (const path of collider.paths) {
				path.forEach(([x = 0, y = 0], index) =>
					index ? context.lineTo(x, y) : context.moveTo(x, y)
				);
				if (collider.type !== 'EdgeCollider2D') context.closePath();
			}
		}
		context.stroke();
		context.restore();
	}
	context.restore();
}
