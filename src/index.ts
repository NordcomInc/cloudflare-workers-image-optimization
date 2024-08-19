const isValidUrl = (url: string) => {
	try {
		new URL(url);
		return true;
	} catch (err) {
		return false;
	}
};

const handleRequest = async (request: Request, _env: {}, ctx: ExecutionContext): Promise<Response> => {
	const accept = request.headers.get('accept');
	const isWebp =
		accept
			?.split(',')
			.map((format) => format.trim())
			.some((format) => ['image/webp', '*/*', 'image/*'].includes(format)) ?? true;

	const url = new URL(request.url);

	const params = url.searchParams;
	let imageUrl = params.get('url');
	if (imageUrl?.startsWith('/')) {
		imageUrl = `https://demo.nordcom.io${imageUrl}`;
	}
	if (!imageUrl || !isValidUrl(imageUrl)) {
		return new Response('url is required', { status: 400 });
	}

	const cache = caches.default;
	url.searchParams.append('webp', isWebp.toString());
	const cacheKey = new Request(url.toString());
	const cachedResponse = await cache.match(cacheKey);
	if (cachedResponse) {
		return cachedResponse;
	}

	let width: null | number = null;
	if (params.get('w')) {
		width = Number.parseInt(params.get('w')!);
	}

	let height: null | number = null;
	if (params.get('h')) {
		height = Number.parseInt(params.get('h')!);
	}

	if (!width && !height) {
		return new Response('Width or height not supplied', { status: 400 });
	} else if (!width && height) {
		width = height;
	} else if (width && !height) {
		height = width;
	}

	const quality = params.get('q');

	const [image, contentType] = await fetch(imageUrl, {
		cf: {
			cacheKey: new URL(imageUrl).pathname || imageUrl,
			image: {
				width: width!,
				height: height!,
				quality: quality ? parseInt(quality) : undefined,
			},
		},
	})
		.then(async (res) => (res.ok ? ([await res.arrayBuffer(), res.headers.get('content-type')] as const) : []))
		.catch(() => []);

	if (!image) {
		return new Response('image not found', { status: 404 });
	}

	if (contentType && ['image/svg+xml', 'image/gif'].includes(contentType)) {
		const response = new Response(image, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=31536000, immutable',
			},
		});
		ctx.waitUntil(cache.put(cacheKey, response.clone()));
		return response;
	}

	//const format = isWebp ? 'webp' : contentType === 'image/jpeg' ? 'jpeg' : 'png';
	/*const image = await optimizeImage({
		image: srcImage,
		width: width ? parseInt(width) : undefined,
		quality: quality ? parseInt(quality) : undefined,
		format,
	});*/
	const response = new Response(image, {
		headers: {
			'Content-Type': contentType!, //`image/${format}`,
			'Cache-Control': 'public, max-age=31536000, immutable',
			date: new Date().toUTCString(),
		},
	});
	ctx.waitUntil(cache.put(cacheKey, response.clone()));
	return response;
};

export default {
	fetch: handleRequest,
};
