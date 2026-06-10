import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  getUrl, getScreenshots, deleteScreenshot, getUrlDevices, updateUrlDevices, triggerScreenshot
} from '../api.js'
import ImageCompare from '../components/ImageCompare.jsx'
import DevicePresetManager from '../components/DevicePresetManager.jsx'

const DEVICE_TYPE_LABELS = {
  desktop: { label: '桌面', icon: '🖥', color: 'blue' },
  tablet: { label: '平板', icon: '📱', color: 'purple' },
  mobile: { label: '移动', icon: '📲', color: 'green' },
  custom: { label: '自定义', icon: '⚙', color: 'gray' }
}

const VIEW_MODES = {
  grid: { label: '网格视图', icon: '▦' },
  carousel: { label: '轮播视图', icon: '◩' }
}

function getScreenshotUrl(filePath) {
  const idx = filePath.indexOf('screenshots')
  if (idx === -1) return ''
  return '/' + filePath.slice(idx).replace(/\\/g, '/')
}

function getDeviceMeta(type) {
  return DEVICE_TYPE_LABELS[type] || DEVICE_TYPE_LABELS.custom
}

export default function ScreenshotTimeline() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [urlInfo, setUrlInfo] = useState(null)
  const [screenshots, setScreenshots] = useState([])
  const [urlDevices, setUrlDevices] = useState([])
  const [viewMode, setViewMode] = useState('grid')
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState([])
  const [showCompare, setShowCompare] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [carouselDeviceIndex, setCarouselDeviceIndex] = useState(0)
  const [showDeviceConfig, setShowDeviceConfig] = useState(false)
  const [showDeviceSelector, setShowDeviceSelector] = useState(false)
  const [screenshotting, setScreenshotting] = useState(false)
  const [filterDevice, setFilterDevice] = useState(null)

  const firstCompareId = compareSelection[0] || null
  const secondCompareId = compareSelection[1] || null

  const availableDevices = useMemo(() => {
    const unique = new Map()
    screenshots.forEach(s => {
      if (s.device_name && !unique.has(s.device_name)) {
        unique.set(s.device_name, s.device_type)
      }
    })
    return Array.from(unique.entries()).map(([name, type]) => ({ name, type }))
  }, [screenshots])

  const timeGroups = useMemo(() => {
    const groups = {}
    const filtered = filterDevice
      ? screenshots.filter(s => s.device_name === filterDevice)
      : screenshots
    filtered.forEach(shot => {
      const timeKey = dayjs(shot.created_at).format('YYYY-MM-DD HH:mm')
      if (!groups[timeKey]) groups[timeKey] = []
      groups[timeKey].push(shot)
    })
    return groups
  }, [screenshots, filterDevice])

  const timeKeys = useMemo(
    () => Object.keys(timeGroups).sort((a, b) => b.localeCompare(a)),
    [timeGroups]
  )

  const carouselTimes = timeKeys
  const carouselDeviceList = useMemo(() => {
    if (carouselTimes.length === 0) return []
    return timeGroups[carouselTimes[carouselIndex]] || []
  }, [carouselTimes, carouselIndex, timeGroups])

  const loadData = async () => {
    try {
      const [urlRes, shotsRes, devicesRes] = await Promise.all([
        getUrl(id),
        getScreenshots(id),
        getUrlDevices(id).catch(() => ({ data: [] }))
      ])
      setUrlInfo(urlRes.data)
      setScreenshots(shotsRes.data)
      setUrlDevices(devicesRes.data || [])
    } catch (err) {
      alert('加载失败: ' + err.message)
    }
  }

  useEffect(() => {
    setCompareSelection([])
    setShowCompare(false)
    setCompareMode(false)
    setPreviewImage(null)
    setCarouselIndex(0)
    setCarouselDeviceIndex(0)
    setFilterDevice(null)
    loadData()
  }, [id])

  const handleDelete = async (shot) => {
    const msg = `确定删除此截图 (${dayjs(shot.created_at).format('YYYY-MM-DD HH:mm')} [${shot.device_name || '默认'}])？`
    if (!confirm(msg)) return
    try {
      await deleteScreenshot(shot.id)
      setCompareSelection(prev => prev.filter(sid => sid !== shot.id))
      loadData()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  const handleSelectCompare = (shotId) => {
    setCompareSelection(prev => {
      const idx = prev.indexOf(shotId)
      if (idx !== -1) {
        return prev.filter(sid => sid !== shotId)
      }
      if (prev.length === 0) {
        return [shotId]
      }
      if (prev.length === 1) {
        return [prev[0], shotId]
      }
      return [prev[1], shotId]
    })
  }

  const resetCompareSelection = () => {
    setCompareSelection([])
    setShowCompare(false)
    setCompareMode(false)
  }

  const startCompare = () => {
    if (compareSelection.length < 2) {
      alert('请选择两张截图进行对比')
      return
    }
    setShowCompare(true)
  }

  const handleSelectDevicesForConfig = async (selected) => {
    try {
      const devices = selected.map(d => ({
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
      await updateUrlDevices(id, devices)
      setUrlDevices(devices)
      setShowDeviceSelector(false)
      alert('设备配置已更新，下次截图将使用新配置')
    } catch (err) {
      alert('更新失败: ' + (err.response?.data?.error || err.message))
    }
  }

  const handleTriggerScreenshot = async () => {
    setScreenshotting(true)
    try {
      const res = await triggerScreenshot(id)
      const data = res.data
      loadData()
      if (data.failed > 0) {
        alert(`截图完成：成功 ${data.success} 个，失败 ${data.failed} 个`)
      } else {
        alert(`截图完成：成功 ${data.success || '全部'} 个设备`)
      }
    } catch (err) {
      alert('截图失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setScreenshotting(false)
    }
  }

  const firstShot = firstCompareId ? screenshots.find(s => s.id === firstCompareId) : null
  const secondShot = secondCompareId ? screenshots.find(s => s.id === secondCompareId) : null

  const orderedShots = firstShot && secondShot
    ? dayjs(firstShot.created_at).isBefore(secondShot.created_at)
      ? [firstShot, secondShot]
      : [secondShot, firstShot]
    : null

  const carouselPrev = () => {
    setCarouselDeviceIndex(i => Math.max(0, i - 1))
  }

  const carouselNext = () => {
    setCarouselDeviceIndex(i => Math.min(carouselDeviceList.length - 1, i + 1))
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button
          onClick={() => navigate('/')}
          className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          ← 返回列表
        </button>
        <div className="h-6 w-px bg-gray-300"></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-gray-800 truncate">
            {urlInfo?.name || '加载中...'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{urlInfo?.url}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleTriggerScreenshot}
            disabled={screenshotting}
            className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-100 disabled:opacity-50"
          >
            {screenshotting ? '截图中...' : '立即截图'}
          </button>
          <button
            onClick={() => setShowDeviceConfig(true)}
            className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200"
          >
            ⚙ 配置设备
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="text-gray-600">
              共 <span className="font-medium text-gray-900">{screenshots.length}</span> 张截图
            </span>
            {urlDevices.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-gray-500">配置设备:</span>
                {urlDevices.slice(0, 3).map((d, i) => {
                  const meta = getDeviceMeta(d.device_type)
                  return (
                    <span key={i} className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">
                      {meta.icon} {d.device_name}
                    </span>
                  )
                })}
                {urlDevices.length > 3 && (
                  <span className="text-gray-500 text-xs">+{urlDevices.length - 3}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {availableDevices.length > 0 && (
              <div className="flex items-center gap-1 mr-2">
                <span className="text-xs text-gray-500 mr-1">筛选:</span>
                <select
                  value={filterDevice || ''}
                  onChange={(e) => setFilterDevice(e.target.value || null)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="">全部设备</option>
                  {availableDevices.map((d, i) => (
                    <option key={i} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="inline-flex rounded-lg border border-gray-200">
              {Object.entries(VIEW_MODES).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    viewMode === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  } ${key === 'carousel' ? 'rounded-r-lg border-l border-gray-200' : 'rounded-l-lg'}`}
                >
                  <span className="mr-1">{val.icon}</span>
                  {val.label}
                </button>
              ))}
            </div>
            {compareMode ? (
              <div className="flex gap-2 ml-2">
                <span className="text-sm text-gray-500 py-1.5">
                  已选: {compareSelection.length} / 2
                </span>
                <button
                  onClick={startCompare}
                  disabled={compareSelection.length < 2}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  对比
                </button>
                <button
                  onClick={resetCompareSelection}
                  className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (screenshots.length < 2) {
                    alert('至少需要两张截图才能对比')
                    return
                  }
                  setCompareSelection([])
                  setShowCompare(false)
                  setCompareMode(true)
                }}
                className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm hover:bg-blue-100"
              >
                🆚 对比模式
              </button>
            )}
          </div>
        </div>
      </div>

      {screenshots.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          暂无截图，点击右上角"立即截图"开始
        </div>
      ) : viewMode === 'carousel' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {carouselTimes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">该筛选条件下无截图</div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{carouselTimes[carouselIndex]}</h3>
                  <p className="text-sm text-gray-500">共 {carouselDeviceList.length} 个设备</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCarouselIndex(i => Math.max(0, i - 1))}
                    disabled={carouselIndex <= 0}
                    className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
                  >
                    上一批
                  </button>
                  <span className="text-sm text-gray-600">
                    {carouselIndex + 1} / {carouselTimes.length}
                  </span>
                  <button
                    onClick={() => setCarouselIndex(i => Math.min(carouselTimes.length - 1, i + 1))}
                    disabled={carouselIndex >= carouselTimes.length - 1}
                    className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
                  >
                    下一批
                  </button>
                </div>
              </div>
              {carouselDeviceList.length > 0 && (
                <>
                  <div className="relative">
                    <button
                      onClick={carouselPrev}
                      disabled={carouselDeviceIndex <= 0}
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white shadow-lg rounded-full w-10 h-10 flex items-center justify-center text-xl disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <div className="px-14">
                      {(() => {
                        const shot = carouselDeviceList[carouselDeviceIndex]
                        if (!shot) return null
                        const meta = getDeviceMeta(shot.device_type)
                        const imgUrl = getScreenshotUrl(shot.file_path)
                        return (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg bg-${meta.color}-100 text-${meta.color}-600 flex items-center justify-center text-xl`}>
                                  {meta.icon}
                                </div>
                                <div>
                                  <div className="font-medium text-gray-900">{shot.device_name || '默认设备'}</div>
                                  <div className="text-xs text-gray-500">
                                    {shot.viewport_width} × {shot.viewport_height} · DPR {shot.device_scale_factor}
                                  </div>
                                </div>
                              </div>
                              {!compareMode && (
                                <button
                                  onClick={() => setPreviewImage({ src: imgUrl, time: shot.created_at, device: shot.device_name })}
                                  className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200"
                                >
                                  查看大图
                                </button>
                              )}
                            </div>
                            <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                              <img
                                src={imgUrl}
                                alt={`screenshot-${shot.id}`}
                                className="w-full h-auto object-contain mx-auto"
                                style={{ maxHeight: '70vh' }}
                              />
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                    <button
                      onClick={carouselNext}
                      disabled={carouselDeviceIndex >= carouselDeviceList.length - 1}
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white shadow-lg rounded-full w-10 h-10 flex items-center justify-center text-xl disabled:opacity-30"
                    >
                      ›
                    </button>
                  </div>
                  <div className="flex justify-center mt-4 gap-2">
                    {carouselDeviceList.map((shot, idx) => (
                      <button
                        key={shot.id}
                        onClick={() => setCarouselDeviceIndex(idx)}
                        className={`w-3 h-3 rounded-full transition-colors ${
                          carouselDeviceIndex === idx ? 'bg-blue-600' : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {timeKeys.map((timeKey) => {
            const shots = timeGroups[timeKey]
            const datePart = timeKey.split(' ')[0]
            return (
              <div key={timeKey}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-lg font-semibold text-gray-800">{datePart}</div>
                  <div className="flex-1 h-px bg-gray-200"></div>
                  <div className="text-sm text-gray-500">{shots.length} 张 · {timeKey.split(' ')[1]}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {shots.map((shot) => {
                    const isFirst = firstCompareId === shot.id
                    const isSecond = secondCompareId === shot.id
                    const imgUrl = getScreenshotUrl(shot.file_path)
                    const meta = getDeviceMeta(shot.device_type)
                    const aspectRatio = shot.viewport_width && shot.viewport_height
                      ? shot.viewport_width / shot.viewport_height
                      : 16 / 9

                    return (
                      <div
                        key={shot.id}
                        className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden transition-all ${
                          isFirst || isSecond
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:shadow-md'
                        } ${compareMode ? 'cursor-pointer' : ''}`}
                        onClick={() => compareMode && handleSelectCompare(shot.id)}
                      >
                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{meta.icon}</span>
                            <div>
                              <div className="text-sm font-medium text-gray-800 truncate max-w-[150px]">
                                {shot.device_name || '默认'}
                              </div>
                              <div className="text-xs text-gray-500">
                                {shot.viewport_width}×{shot.viewport_height}
                              </div>
                            </div>
                          </div>
                          {(isFirst || isSecond) && (
                            <div className="bg-blue-600 text-white text-xs font-medium px-2 py-0.5 rounded">
                              {isFirst ? '已选1' : '已选2'}
                            </div>
                          )}
                        </div>
                        <div
                          className="relative bg-gray-100 overflow-hidden"
                          style={{ aspectRatio }}
                          onClick={(e) => {
                            if (!compareMode) {
                              e.stopPropagation()
                              setPreviewImage({ src: imgUrl, time: shot.created_at, device: shot.device_name })
                            }
                          }}
                        >
                          <img
                            src={imgUrl}
                            alt={`screenshot-${shot.id}`}
                            className="w-full h-full object-cover object-top"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-3">
                          <div className="text-sm text-gray-700 font-medium">
                            {dayjs(shot.created_at).format('HH:mm:ss')}
                          </div>
                          {!compareMode && (
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPreviewImage({ src: imgUrl, time: shot.created_at, device: shot.device_name })
                                }}
                                className="flex-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
                              >
                                查看大图
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(shot)
                                }}
                                className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded hover:bg-red-100"
                              >
                                删除
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex flex-col"
          onClick={() => setPreviewImage(null)}
        >
          <div className="bg-gray-900 px-6 py-4 flex justify-between items-center">
            <div>
              <h3 className="text-white font-medium">
                {dayjs(previewImage.time).format('YYYY-MM-DD HH:mm:ss')}
              </h3>
              {previewImage.device && (
                <p className="text-gray-400 text-sm mt-0.5">{previewImage.device}</p>
              )}
            </div>
            <button className="text-white hover:text-gray-300 text-2xl leading-none">×</button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-6">
            <img
              src={previewImage.src}
              alt="preview"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {showCompare && orderedShots && (
        <ImageCompare
          beforeImage={getScreenshotUrl(orderedShots[0].file_path)}
          afterImage={getScreenshotUrl(orderedShots[1].file_path)}
          beforeLabel={`${orderedShots[0].device_name || '默认'} · ${dayjs(orderedShots[0].created_at).format('YYYY-MM-DD HH:mm:ss')}`}
          afterLabel={`${orderedShots[1].device_name || '默认'} · ${dayjs(orderedShots[1].created_at).format('YYYY-MM-DD HH:mm:ss')}`}
          onClose={resetCompareSelection}
        />
      )}

      {showDeviceConfig && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">截图设备配置</h3>
              <button
                onClick={() => setShowDeviceConfig(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {urlDevices.length > 0 ? (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-gray-700 mb-3">当前配置的设备：</div>
                  <div className="grid gap-2">
                    {urlDevices.map((d, idx) => {
                      const meta = getDeviceMeta(d.device_type)
                      return (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-white rounded border border-gray-200">
                          <div className={`w-10 h-10 rounded-lg bg-${meta.color}-100 text-${meta.color}-600 flex items-center justify-center text-xl`}>
                            {meta.icon}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{d.device_name}</div>
                            <div className="text-xs text-gray-500">
                              {d.width} × {d.height} · DPR {d.device_scale_factor}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
                  当前未配置设备，将使用系统默认设备（桌面端 + iPad + iPhone + Android）
                </div>
              )}
              <div className="flex justify-center">
                <button
                  onClick={() => setShowDeviceSelector(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  选择设备
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowDeviceConfig(false)}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeviceSelector && (
        <DevicePresetManager
          selectionMode
          onClose={() => setShowDeviceSelector(false)}
          onSelect={handleSelectDevicesForConfig}
        />
      )}
    </div>
  )
}
