export default {
  async fetch(request, env) {
    return new Response("Wocult Worker local setup is ready. Do not deploy this placeholder.", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};
