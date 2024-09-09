const isValidUrl = (url: string) => {
    try {
        new URL(url);
        return true;
    } catch (err) {
        return false;
    }
};

const fallbackDomain = 'demo.nordcom.io'; // TODO.

const handleRequest = async (request: Request, _env: {}, ctx: ExecutionContext): Promise<Response> => {
    if (request.headers.get('via') && /image-resizing/.test(request.headers.get('via')!)) {
        return await fetch(request);
    }

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
        imageUrl = `https://${fallbackDomain}${imageUrl}`;
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

    let format = 'auto';
    if (accept) {
        if (/image\/avif/.test(accept)) {
            format = 'avif';
        } else if (/image\/webp/.test(accept)) {
            format = 'webp';
        }
    }

    const quality = params.has('q') ? Number.parseInt(params.get('q')!) : undefined;

    const [image, contentType] = await fetch(imageUrl, {
        cf: {
            cacheKey: new URL(imageUrl).pathname || imageUrl,
            image: {
                format: format! as any,
                width: width!,
                height: height!,
                quality: quality,
                metadata: 'copyright'
            }
        }
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
                'Cache-Control': 'public, max-age=31536000, immutable'
            }
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
    }

    const response = new Response(image, {
        headers: {
            'Content-Type': contentType!, //`image/${format}`,
            'Cache-Control': 'public, max-age=31536000, immutable',
            date: new Date().toUTCString()
        }
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
};

export default {
    fetch: handleRequest
};
