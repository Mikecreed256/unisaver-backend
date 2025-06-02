const axios = require('axios');

const API_BASE_URL = 'https://savebackend.onrender.com/api';

async function downloadYouTubeVideo(url) {
  const response = await axios.get(`${API_BASE_URL}/youtube`, {
    params: { url }
  });
  return response.data;
}

module.exports = {
  downloadYouTubeVideo
};
