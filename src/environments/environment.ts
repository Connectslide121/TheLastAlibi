export const environment = {
  production: true,
  geminiApiKey: 'AIzaSyCROfouhxr1Wja-yuiadKpf989Eekg7Hic',
  // Gemma 3 27B via Gemini Developer API
  llmApiEndpoint:
    'https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent',
  // Imagen 4 Fast — requires paid Gemini API plan
  imageApiEndpoint:
    'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict',
};
