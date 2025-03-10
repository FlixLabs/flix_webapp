<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const alert = ref({
  visible: false,
  type: null as null | string,
  icon: null as null | string,
  text: ''
});

function showSuccessAlert(text = 'L\'opération a été réussie !') {
  alert.value = {
    visible: true,
    type: 'success',
    icon: 'mdi-check-circle',
    text
  };
  setTimeout(() => {
    alert.value.visible = false;
  }, 5000);
}

function showErrorAlert(text = 'Une erreur est survenue !') {
  alert.value = {
    visible: true,
    type: 'error',
    icon: 'mdi-alert-circle',
    text
  };
  setTimeout(() => {
    alert.value.visible = false;
  }, 5000);
}

// Barre de recherche (locale)
const search = ref('');

// Au lieu de 'v-segmented', on utilise 'v-btn-toggle' :
// on garde deux valeurs possibles : "movie" ou "series"
const selectedView = ref<'movie' | 'series'>('movie');

// Films (Radarr)
const radarrMovies = ref<any[]>([]);
const is_loading_movies = ref(false);

// Séries (Sonarr)
const sonarrSeries = ref<any[]>([]);
const is_loading_series = ref(false);

function getRadarrMovies() {
  is_loading_movies.value = true;
  const base_url = import.meta.env.VITE_RADARR_BASE_URL;
  const api_key = import.meta.env.VITE_RADARR_API_KEY;

  fetch(`${base_url}/api/v3/movie?apikey=${api_key}`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Erreur lors de la récupération des films : ${response.status}`);
      }
      const data = await response.json();
      radarrMovies.value = data.map((movie: any) => {
        const posterImg = movie.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl
                          || 'https://placehold.co/200x300?text=No+Image&font=roboto';
        return {
          id: movie.id,
          title: movie.title,
          year: movie.year,
          overview: movie.overview,
          poster: posterImg
        };
      });
    })
    .catch((err) => {
      showErrorAlert(err.message || 'Impossible de récupérer la liste des films');
      console.error(err);
    })
    .finally(() => {
      is_loading_movies.value = false;
    });
}

function getSonarrSeries() {
  is_loading_series.value = true;
  const base_url = import.meta.env.VITE_SONARR_BASE_URL;
  const api_key = import.meta.env.VITE_SONARR_API_KEY;

  fetch(`${base_url}/api/v3/series?apikey=${api_key}`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Erreur lors de la récupération des séries : ${response.status}`);
      }
      const data = await response.json();
      sonarrSeries.value = data.map((serie: any) => {
        const posterImg = serie.images?.find((img: any) => img.coverType === 'poster')?.remoteUrl
                          || 'https://placehold.co/200x300?text=No+Image&font=roboto';
        return {
          id: serie.id,
          title: serie.title,
          year: serie.year,
          overview: serie.overview,
          poster: posterImg
        };
      });
    })
    .catch((err) => {
      showErrorAlert(err.message || 'Impossible de récupérer la liste des séries');
      console.error(err);
    })
    .finally(() => {
      is_loading_series.value = false;
    });
}

function deleteFromList(type: 'movie' | 'series', item: any) {
  let base_url = '';
  let api_key = '';

  if (type === 'movie') {
    base_url = import.meta.env.VITE_RADARR_BASE_URL;
    api_key = import.meta.env.VITE_RADARR_API_KEY;
  } else {
    base_url = import.meta.env.VITE_SONARR_BASE_URL;
    api_key = import.meta.env.VITE_SONARR_API_KEY;
  }

  fetch(`${base_url}/api/v3/${type}/${item.id}?apikey=${api_key}&deleteFiles=true`, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json;charset=utf-8'
    }
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Échec de la suppression');
      }
      showSuccessAlert('Supprimé avec succès');

      if (type === 'movie') {
        getRadarrMovies();
      } else {
        getSonarrSeries();
      }
    })
    .catch((error) => {
      showErrorAlert('Échec de la suppression');
      console.error(error);
    });
}

// Filtrage local
const filteredMovies = computed(() => {
  if (!search.value) return radarrMovies.value;
  return radarrMovies.value.filter(movie =>
    movie.title.toLowerCase().includes(search.value.toLowerCase())
  );
});
const filteredSeries = computed(() => {
  if (!search.value) return sonarrSeries.value;
  return sonarrSeries.value.filter(serie =>
    serie.title.toLowerCase().includes(search.value.toLowerCase())
  );
});

// Récupération initiale
onMounted(() => {
  getRadarrMovies();
  getSonarrSeries();
});
</script>

<template>
  <transition name="fade">
    <v-alert
      v-if="alert.visible"
      :type="alert.type"
      :icon="alert.icon"
      class="fixed-alert"
      :text="alert.text"
    />
  </transition>

  <v-container>
    <h1>Médiathèque</h1>

    <!-- Remplacement de v-segmented par v-btn-toggle -->
    <v-btn-toggle v-model="selectedView" mandatory>
      <v-btn value="movie">
        Films
      </v-btn>
      <v-btn value="series">
        Séries
      </v-btn>
    </v-btn-toggle>

    <v-text-field
      v-model="search"
      label="Rechercher par titre"
      variant="outlined"
      prepend-icon="mdi-magnify"
      clearable
      class="my-4"
    />

    <!-- FILMS -->
    <div v-if="selectedView === 'movie'">
      <h3>Films (Radarr)</h3>
      <v-row
        v-if="is_loading_movies"
        justify="center"
        align="center"
        class="mt-4"
      >
        <v-progress-circular indeterminate color="primary" size="50" />
        <span class="ml-2">Chargement des films...</span>
      </v-row>

      <v-row
        v-else-if="filteredMovies.length"
        class="mt-2"
        dense
      >
        <v-col
          v-for="(item, index) in filteredMovies"
          :key="index"
          cols="6"
          sm="4"
          md="3"
          lg="2"
          class="mb-4"
        >
          <v-card class="movie-card">
            <v-img
              :src="item.poster"
              aspect-ratio="0.66"
            />
            <v-card-title class="title-line">
              {{ item.title }} ({{ item.year }})
            </v-card-title>
            <v-card-text class="truncate-overview px-3">
              {{ item.overview }}
            </v-card-text>
            <v-card-actions>
              <v-btn
                color="error"
                variant="outlined"
                block
                @click="deleteFromList('movie', item)"
              >
                Supprimer
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
      <v-alert
        v-else
        type="info"
        class="mt-4"
      >
        Aucun film trouvé
      </v-alert>
    </div>

    <!-- SERIES -->
    <div v-else-if="selectedView === 'series'">
      <h3>Séries (Sonarr)</h3>
      <v-row
        v-if="is_loading_series"
        justify="center"
        align="center"
        class="mt-4"
      >
        <v-progress-circular indeterminate color="primary" size="50" />
        <span class="ml-2">Chargement des séries...</span>
      </v-row>

      <v-row
        v-else-if="filteredSeries.length"
        class="mt-2"
        dense
      >
        <v-col
          v-for="(item, index) in filteredSeries"
          :key="index"
          cols="6"
          sm="4"
          md="3"
          lg="2"
          class="mb-4"
        >
          <v-card class="movie-card">
            <v-img
              :src="item.poster"
              aspect-ratio="0.66"
            />
            <v-card-title class="title-line">
              {{ item.title }} ({{ item.year }})
            </v-card-title>
            <v-card-text class="truncate-overview px-3">
              {{ item.overview }}
            </v-card-text>
            <v-card-actions>
              <v-btn
                color="error"
                variant="outlined"
                block
                @click="deleteFromList('series', item)"
              >
                Supprimer
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
      <v-alert
        v-else
        type="info"
        class="mt-4"
      >
        Aucune série trouvée
      </v-alert>
    </div>
  </v-container>
</template>

<style scoped>
.fixed-alert {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 9999;
  max-width: 300px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}
.fade-enter-to {
  opacity: 1;
  transform: translateY(0);
}
.fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.movie-card {
  border-radius: 8px;
  overflow: hidden;
}
.title-line {
  font-size: 1rem;
  line-height: 1.2;
}
.truncate-overview {
  display: -webkit-box;
  -webkit-line-clamp: 3; /* 3 lignes max */
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: #666;
  font-size: 0.9em;
  margin-top: 5px;
}
</style>
