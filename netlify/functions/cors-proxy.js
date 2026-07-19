/**
 * CORS Proxy — Netlify Function
 * ===============================
 * Fetches a remote URL and returns the response.
 * Called as: /.netlify/functions/cors-proxy?url=https://...
 * The articles.js calls /cors-proxy/{encodedURL} which is redirected here.
 */

exports.handler = async (event) => {
  // Extract URL from query string or path
  let url = event.queryStringParameters?.url;

  if (!url) {
    // Try to extract from the path: /.netlify/functions/cors-proxy/https%3A%2F%2F...
    const pathParts = event.path.split('/cors-proxy/');
    if (pathParts.length > 1) {
      url = decodeURIComponent(pathParts[1]);
    }
  }

  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing url parameter' }),
    };
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'PMNZ-Website/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: `Upstream error: ${resp.status}`,
      };
    }

    const body = await resp.text();
    const contentType = resp.headers.get('content-type') || 'application/xml';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
      body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: `Fetch failed: ${err.message}`,
    };
  }
};