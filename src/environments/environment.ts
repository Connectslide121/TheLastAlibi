export const environment = {
  production: true,
  geminiApiKey: 'AIzaSyCROfouhxr1Wja-yuiadKpf989Eekg7Hic',
  // Gemma 3 27B via Gemini Developer API
  llmApiEndpoint:
    'https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent',
  // Cloudflare Worker — Workers AI Flux image generation
  imageWorkerEndpoint: 'https://thelastalibi.jonmendi.workers.dev',
};
