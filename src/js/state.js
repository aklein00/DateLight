export const state = {
  location: null,       // { lat, lng, address }
  radius: 1.25,         // miles
  recommendedRadius: null,
  filters: {
    vibe: null,         // romantic | casual | trendy | fancy
    budget: null,       // $ | $$ | $$$
    type: null,         // dinner | drinks | coffee | activity
  },
  datetime: {
    day: null,          // tonight | monday … sunday
    time: null,         // afternoon | evening | late-night
  },
  venues: [],
  curatedVenues: [],
  addonVenue: null,
};
