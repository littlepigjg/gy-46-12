import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000
})

export const getUrls = () => api.get('/urls')
export const addUrl = (data) => api.post('/urls', data)
export const deleteUrl = (id) => api.delete(`/urls/${id}`)
export const updateUrl = (id, data) => api.put(`/urls/${id}`, data)
export const getUrl = (id) => api.get(`/urls/${id}`)
export const getScreenshots = (urlId) => api.get(`/urls/${urlId}/screenshots`)
export const deleteScreenshot = (id) => api.delete(`/screenshots/${id}`)
export const triggerScreenshot = (urlId) => api.post(`/urls/${urlId}/screenshot`)

export const getUrlDevices = (urlId) => api.get(`/urls/${urlId}/devices`)
export const updateUrlDevices = (urlId, devices) => api.put(`/urls/${urlId}/devices`, { devices })

export const getDevices = () => api.get('/devices')
export const addDevice = (data) => api.post('/devices', data)
export const updateDevice = (id, data) => api.put(`/devices/${id}`, data)
export const deleteDevice = (id) => api.delete(`/devices/${id}`)

export default api
