import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getUrls, addUrl, deleteUrl, triggerScreenshot } from '../api.js'
import DevicePresetManager from '../components/DevicePresetManager.jsx'

const FREQUENCY_LABELS = {
  hourly: '每小时',
  daily: '每天',
  weekly: '每周',
  monthly: '每月'
}

const STRATEGY_LABELS = {
  parallel: { label: '并行执行', desc: '同时截图，速度快' },
  serial: { label: '串行执行', desc: '依次截图，节省资源' }
}

export default function UrlList() {
  const [urls, setUrls] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [showDeviceManager, setShowDeviceManager] = useState(false)
  const [showDeviceSelector, setShowDeviceSelector] = useState(false)
  const [formData, setFormData] = useState({
    url: '',
    name: '',
    frequency: 'daily',
    execution_strategy: 'parallel',
    devices: []
  })
  const [loading, setLoading] = useState(false)
  const [screenshottingId, setScreenshottingId] = useState(null)
  const navigate = useNavigate()

  const loadUrls = async () => {
    try {
      const res = await getUrls()
      setUrls(res.data)
    } catch (err) {
      alert('加载失败: ' + err.message)
    }
  }

  useEffect(() => {
    loadUrls()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.url || !formData.name) {
      alert('请填写完整信息')
      return
    }
    if (formData.devices.length === 0) {
      if (!confirm('未选择截图设备，将使用系统默认设备，是否继续？')) return
    }
    setLoading(true)
    try {
      const payload = {
        url: formData.url,
        name: formData.name,
        frequency: formData.frequency,
        execution_strategy: formData.execution_strategy,
        devices: formData.devices
      }
      await addUrl(payload)
      setShowAddForm(false)
      setFormData({
        url: '',
        name: '',
        frequency: 'daily',
        execution_strategy: 'parallel',
        devices: []
      })
      loadUrls()
    } catch (err) {
      alert('添加失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`确定删除 "${name}" 及其所有截图吗？`)) return
    try {
      await deleteUrl(id)
      loadUrls()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  const handleScreenshot = async (id) => {
    setScreenshottingId(id)
    try {
      const res = await triggerScreenshot(id)
      loadUrls()
      const data = res.data
      if (data.failed > 0) {
        alert(`截图完成：成功 ${data.success} 个，失败 ${data.failed} 个`)
      } else {
        alert(`截图完成：成功 ${data.success || '全部'} 个设备`)
      }
    } catch (err) {
      alert('截图失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setScreenshottingId(null)
    }
  }

  const handleSelectDevices = (selected) => {
    setFormData(prev => ({
      ...prev,
      devices: selected.map(d => ({
        device_id: d.id,
        device_name: d.name,
        device_type: d.type,
        width: d.width,
        height: d.height,
        device_scale_factor: d.device_scale_factor,
        user_agent: d.user_agent,
        is_mobile: d.is_mobile,
        is_touch: d.is_touch
      }))
    }))
    setShowDeviceSelector(false)
  }

  const removeDevice = (idx) => {
    setFormData(prev => ({
      ...prev,
      devices: prev.devices.filter((_, i) => i !== idx)
    }))
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-gray-800">监控URL列表</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDeviceManager(true)}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            ⚙ 设备管理
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 添加URL
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">添加新URL</h3>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如: 百度首页"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">截图频率</label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="hourly">每小时</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">多设备执行策略</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(STRATEGY_LABELS).map(([key, val]) => (
                    <label
                      key={key}
                      className={`border rounded-lg p-2 cursor-pointer transition-all ${
                        formData.execution_strategy === key
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name="strategy"
                        value={key}
                        checked={formData.execution_strategy === key}
                        onChange={(e) => setFormData({ ...formData, execution_strategy: e.target.value })}
                        className="sr-only"
                      />
                      <div className="text-sm font-medium text-gray-900">{val.label}</div>
                      <div className="text-xs text-gray-500">{val.desc}</div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  截图设备 <span className="text-gray-500 font-normal">(可选，不选则使用默认设备)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowDeviceSelector(true)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  + 选择设备
                </button>
              </div>
              {formData.devices.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {formData.devices.map((device, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 bg-gray-50">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${
                          device.device_type === 'desktop' ? 'bg-blue-100 text-blue-600' :
                          device.device_type === 'tablet' ? 'bg-purple-100 text-purple-600' :
                          device.device_type === 'mobile' ? 'bg-green-100 text-green-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {device.device_type === 'desktop' ? '🖥' :
                           device.device_type === 'tablet' ? '📱' :
                           device.device_type === 'mobile' ? '📲' : '⚙'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{device.device_name}</div>
                          <div className="text-xs text-gray-500">{device.width} × {device.height} · DPR {device.device_scale_factor}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDevice(idx)}
                        className="text-gray-400 hover:text-red-600 text-xl leading-none flex-shrink-0"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              {formData.devices.length === 0 && (
                <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-500">
                  未选择设备，将使用系统默认设备 (桌面端 + iPad + iPhone)
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '添加中...' : '添加'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {urls.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
            暂无监控URL，点击右上角添加
          </div>
        ) : (
          urls.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/url/${item.id}`)}>
                  <h3 className="text-lg font-medium text-gray-900 hover:text-blue-600">
                    {item.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 truncate">{item.url}</p>
                  <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {FREQUENCY_LABELS[item.frequency]}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {STRATEGY_LABELS[item.execution_strategy]?.label || item.execution_strategy}
                    </span>
                    <span className="text-gray-500">
                      截图数: <span className="font-medium text-gray-700">{item.screenshot_count}</span>
                    </span>
                    {item.last_screenshot_at && (
                      <span className="text-gray-500">
                        上次截图: {dayjs(item.last_screenshot_at).format('YYYY-MM-DD HH:mm')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleScreenshot(item.id)}
                    disabled={screenshottingId === item.id}
                    className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-100 disabled:opacity-50 flex-shrink-0"
                  >
                    {screenshottingId === item.id ? '截图中...' : '立即截图'}
                  </button>
                  <button
                    onClick={() => handleDelete(item.id, item.name)}
                    className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm hover:bg-red-100 flex-shrink-0"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showDeviceManager && (
        <DevicePresetManager onClose={() => setShowDeviceManager(false)} />
      )}

      {showDeviceSelector && (
        <DevicePresetManager
          selectionMode
          onClose={() => setShowDeviceSelector(false)}
          onSelect={handleSelectDevices}
        />
      )}
    </div>
  )
}
