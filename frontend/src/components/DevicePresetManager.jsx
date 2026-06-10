import { useState, useEffect } from 'react'
import { getDevices, addDevice, updateDevice, deleteDevice } from '../api.js'

const DEVICE_TYPE_LABELS = {
  desktop: '桌面',
  tablet: '平板',
  mobile: '移动',
  custom: '自定义'
}

const EMPTY_DEVICE = {
  name: '',
  type: 'custom',
  width: 1920,
  height: 1080,
  device_scale_factor: 1,
  user_agent: '',
  is_mobile: 0,
  is_touch: 0,
  sort_order: 0
}

export default function DevicePresetManager({ onClose, onSelect, selectionMode = false }) {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingDevice, setEditingDevice] = useState(null)
  const [formData, setFormData] = useState({ ...EMPTY_DEVICE })
  const [selectedIds, setSelectedIds] = useState([])

  const loadDevices = async () => {
    setLoading(true)
    try {
      const res = await getDevices()
      setDevices(res.data)
    } catch (err) {
      alert('加载设备列表失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [])

  const handleAdd = () => {
    setEditingDevice(null)
    setFormData({ ...EMPTY_DEVICE })
    setShowForm(true)
  }

  const handleEdit = (device) => {
    setEditingDevice(device)
    setFormData({
      name: device.name,
      type: device.type,
      width: device.width,
      height: device.height,
      device_scale_factor: device.device_scale_factor,
      user_agent: device.user_agent || '',
      is_mobile: device.is_mobile,
      is_touch: device.is_touch,
      sort_order: device.sort_order
    })
    setShowForm(true)
  }

  const handleDelete = async (device) => {
    if (!confirm(`确定删除设备预设 "${device.name}"？`)) return
    try {
      await deleteDevice(device.id)
      alert('删除成功')
      loadDevices()
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.error || err.message))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.width || !formData.height) {
      alert('请填写名称、宽度、高度')
      return
    }
    try {
      if (editingDevice) {
        await updateDevice(editingDevice.id, formData)
      } else {
        await addDevice(formData)
      }
      setShowForm(false)
      loadDevices()
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.error || err.message))
    }
  }

  const toggleSelect = (device) => {
    setSelectedIds(prev => {
      const idx = prev.indexOf(device.id)
      if (idx !== -1) {
        return prev.filter(id => id !== device.id)
      }
      return [...prev, device.id]
    })
  }

  const handleConfirmSelection = () => {
    if (!onSelect) return
    const selected = devices.filter(d => selectedIds.includes(d.id))
    onSelect(selected)
  }

  const toggleSelectAllDefault = () => {
    const defaultIds = devices.filter(d => d.is_default === 1).map(d => d.id)
    const allSelected = defaultIds.every(id => selectedIds.includes(id))
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !defaultIds.includes(id)))
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...defaultIds])])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {selectionMode ? '选择截图设备' : '设备预设管理'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >×</button>
        </div>

        {selectionMode && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex gap-3 items-center flex-wrap">
            <button
              onClick={toggleSelectAllDefault}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              全选/取消默认设备
            </button>
            <span className="text-sm text-gray-500">
              已选 {selectedIds.length} 个设备
            </span>
          </div>
        )}

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : showForm ? (
            <div className="max-w-xl mx-auto">
              <h4 className="text-md font-medium text-gray-800 mb-4">
                {editingDevice ? '编辑设备' : '新增设备'}
              </h4>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">名称 *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="例如: 我的笔记本"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">设备类型</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="desktop">桌面</option>
                      <option value="tablet">平板</option>
                      <option value="mobile">移动</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">宽度 (px) *</label>
                    <input
                      type="number"
                      min="100"
                      value={formData.width}
                      onChange={(e) => setFormData({ ...formData, width: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">高度 (px) *</label>
                    <input
                      type="number"
                      min="100"
                      value={formData.height}
                      onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">设备像素比 (DPR)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0.5"
                      max="5"
                      value={formData.device_scale_factor}
                      onChange={(e) => setFormData({ ...formData, device_scale_factor: parseFloat(e.target.value) || 1 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">排序</label>
                    <input
                      type="number"
                      value={formData.sort_order}
                      onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">用户代理 (User Agent)</label>
                  <textarea
                    value={formData.user_agent}
                    onChange={(e) => setFormData({ ...formData, user_agent: e.target.value })}
                    rows="2"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="留空则使用默认"
                  />
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!formData.is_mobile}
                      onChange={(e) => setFormData({ ...formData, is_mobile: e.target.checked ? 1 : 0 })}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">移动端模式</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!formData.is_touch}
                      onChange={(e) => setFormData({ ...formData, is_touch: e.target.checked ? 1 : 0 })}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">支持触摸</span>
                  </label>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div>
              {!selectionMode && (
                <div className="mb-4">
                  <button
                    onClick={handleAdd}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
                  >
                    + 新增设备预设
                  </button>
                </div>
              )}
              <div className="grid gap-3">
                {devices.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">暂无设备预设</div>
                ) : (
                  devices.map((device) => {
                    const isSelected = selectedIds.includes(device.id)
                    return (
                      <div
                        key={device.id}
                        className={`border rounded-lg p-4 flex items-center gap-4 transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-gray-300'
                        } ${selectionMode ? 'cursor-pointer' : ''}`}
                        onClick={() => selectionMode && toggleSelect(device)}
                      >
                        {selectionMode && (
                          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(device)}
                              className="w-5 h-5 rounded text-blue-600"
                            />
                          </div>
                        )}
                        <div className="flex-shrink-0">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            device.type === 'desktop' ? 'bg-blue-100 text-blue-600' :
                            device.type === 'tablet' ? 'bg-purple-100 text-purple-600' :
                            device.type === 'mobile' ? 'bg-green-100 text-green-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {device.type === 'desktop' ? '🖥' :
                             device.type === 'tablet' ? '📱' :
                             device.type === 'mobile' ? '📲' : '⚙'}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{device.name}</span>
                            {device.is_default === 1 && (
                              <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">系统</span>
                            )}
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                              {DEVICE_TYPE_LABELS[device.type] || device.type}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-3">
                            <span>{device.width} × {device.height}</span>
                            <span>DPR: {device.device_scale_factor}</span>
                            {device.is_mobile === 1 && <span>移动端</span>}
                            {device.is_touch === 1 && <span>触摸</span>}
                          </div>
                        </div>
                        {!selectionMode && device.is_default !== 1 && (
                          <div className="flex-shrink-0 flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleEdit(device)}
                              className="text-sm text-blue-600 hover:text-blue-700 px-2 py-1"
                            >编辑</button>
                            <button
                              onClick={() => handleDelete(device)}
                              className="text-sm text-red-600 hover:text-red-700 px-2 py-1"
                            >删除</button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          {selectionMode && (
            <button
              onClick={handleConfirmSelection}
              disabled={selectedIds.length === 0}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              确认选择 ({selectedIds.length})
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
          >
            {selectionMode ? '取消' : '关闭'}
          </button>
        </div>
      </div>
    </div>
  )
}
