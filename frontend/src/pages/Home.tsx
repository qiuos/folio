import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeft, ChevronRight } from "lucide-react"
import client from "@/api/client"

interface ReadingItem {
  book_id: number
  book_title: string | null
  progress: number
  format_id: number | null
}

interface PeriodStats {
  books: number
  completed: number
  minutes: number
}

interface ReadingStats {
  total_books: number
  today: PeriodStats
  week: PeriodStats
  month: PeriodStats
  year: PeriodStats
}

const formatMap: Record<number, string> = { 1: "epub", 2: "pdf", 3: "mobi" }

function formatMinutes(m: number): string {
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const min = m % 60
  return min > 0 ? `${h} 小时 ${min} 分` : `${h} 小时`
}

function StatsChart({ stats }: { stats: ReadingStats }) {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">("today")
  const [ranking, setRanking] = useState<any[]>([])
  const [heatmapData, setHeatmapData] = useState<Record<string, { level: number; minutes: number }>>({})
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear())
  const [chartData, setChartData] = useState<Array<{ label: string; value: number }>>([])

  // Timezone offset in hours (e.g., 8 for UTC+8, -5 for UTC-5)
  const tzOffset = Math.round(-new Date().getTimezoneOffset() / 60)

  const periods = [
    { key: "today" as const, label: "今日" },
    { key: "week" as const, label: "本周" },
    { key: "month" as const, label: "本月" },
    { key: "year" as const, label: "本年" },
  ]

  const activeStats = stats[period]
  const labelInterval =
    period === "today" ? 3 :
    period === "month" ? 5 :
    period === "year" ? 2 :
    1
  const chartMinWidth =
    period === "today" ? Math.max(chartData.length * 26, 520) :
    period === "month" ? Math.max(chartData.length * 18, 620) :
    period === "year" ? Math.max(chartData.length * 42, 520) :
    360

  useEffect(() => {
    const token = localStorage.getItem("folio_token")
    if (!token) return
    client.get(`/reading/stats/ranking?period=${period}&tz=${tzOffset}`).then(({ data: resp }: any) => {
      setRanking(resp.data || [])
    }).catch(() => setRanking([]))
  }, [period, tzOffset])

  useEffect(() => {
    const token = localStorage.getItem("folio_token")
    if (!token) return

    // Fetch heatmap data for multiple years to support month navigation
    const yearsToFetch = [heatmapYear - 1, heatmapYear, heatmapYear + 1]
    const promises = yearsToFetch.map(year =>
      client.get(`/reading/stats/heatmap?year=${year}&tz=${tzOffset}`).catch(() => ({ data: { data: { heatmap: {} } } }))
    )

    Promise.all(promises).then((responses) => {
      const combinedHeatmap: Record<string, { level: number; minutes: number }> = {}
      responses.forEach(({ data: resp }: any) => {
        Object.assign(combinedHeatmap, resp.data?.heatmap || {})
      })
      setHeatmapData(combinedHeatmap)
    }).catch(() => setHeatmapData({}))
  }, [heatmapYear, tzOffset])

  useEffect(() => {
    const token = localStorage.getItem("folio_token")
    if (!token) return
    client.get(`/reading/stats/chart?period=${period}&tz=${tzOffset}`).then(({ data: resp }: any) => {
      setChartData(resp.data?.chart_data || [])
    }).catch(() => {
      setChartData([])
    })
  }, [period, tzOffset])

  const buildYearHeatmapData = () => {
    const startDate = new Date(heatmapYear, 0, 1)
    const endDate = new Date(heatmapYear, 11, 31)

    const weeks: Array<{ level: number; minutes: number }[]> = []
    const monthLabels: { month: number; year: number; weekIndex: number; dayIndex: number }[] = []
    let currentWeek: Array<{ level: number; minutes: number }> = []

    const firstDow = startDate.getDay()
    for (let i = 0; i < firstDow; i++) {
      currentWeek.push({ level: 0, minutes: 0 })
    }

    const d = new Date(startDate)
    let weekIndex = 0
    let dayIndex = firstDow

    while (d <= endDate) {
      const m = d.getMonth()
      const y = d.getFullYear()

      if (d.getDate() === 1) {
        monthLabels.push({ month: m, year: y, weekIndex, dayIndex })
      }

      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      currentWeek.push(heatmapData[dateStr] || { level: 0, minutes: 0 })
      dayIndex++

      if (d.getDay() === 6) {
        weeks.push(currentWeek)
        currentWeek = []
        weekIndex++
        dayIndex = 0
      }
      d.setDate(d.getDate() + 1)
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ level: 0, minutes: 0 })
      }
      weeks.push(currentWeek)
    }

    return { weeks, monthLabels, startDate, endDate }
  }

  const ghLevelColor = (level: number) =>
    level === 0 ? 'var(--secondary)' : ['#9be9a8', '#40c463', '#30a14e', '#216e39'][level - 1] || 'var(--secondary)'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex bg-[var(--secondary)] p-1 rounded-xl w-fit">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-6 py-1.5 text-[13px] font-[500] rounded-lg transition-all ${
                period === p.key ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 rounded-[22px] border border-[var(--border)] bg-[var(--card)] overflow-hidden">
        {[
          { label: "阅读时间", value: formatMinutes(activeStats.minutes) },
          { label: "阅读书籍", value: `${activeStats.books} 本` },
          { label: "已读完", value: `${activeStats.completed} 本` },
          { label: "完成率", value: `${activeStats.books > 0 ? Math.round((activeStats.completed / activeStats.books) * 100) : 0}%` },
        ].map((item, idx) => (
          <div key={item.label} className={`p-6 flex flex-col items-center justify-center text-center ${idx < 3 ? "md:border-r border-[var(--border)]" : ""} ${idx % 2 === 0 ? "border-r border-b md:border-b-0" : "border-b md:border-b-0"}`}>
            <p className="text-[14px] font-[500] text-[var(--muted-foreground)] mb-1">{item.label}</p>
            <p className="text-[20px] font-[700] text-[var(--foreground)] mb-1 tracking-[-0.01em]">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6 overflow-hidden">
        <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
          <h3 className="text-[15px] font-[600]">阅读时间分布</h3>
          <span className="sm:hidden text-[11px] text-[var(--muted-foreground)]">横向滑动</span>
        </div>
        <div className="overflow-x-auto overflow-y-hidden -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
        <div className="relative h-[220px] sm:h-[200px] w-full" style={{ minWidth: chartData.length > 10 ? `${chartMinWidth}px` : undefined }}>
          {chartData.length > 0 && chartData.some(d => d.value > 0) ? (
            (() => {
              const trueMax = Math.max(...chartData.map(d => d.value))
              const maxValue = trueMax > 0 ? trueMax : 20
              const gridValues = [
                maxValue,
                Math.round(maxValue * 0.75),
                Math.round(maxValue * 0.5),
                Math.round(maxValue * 0.25),
                0
              ]
              return (
                <>
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-10 sm:pb-6">
                    {gridValues.map((val, idx) => (
                      <div key={idx} className="w-full flex items-center gap-3">
                        <span className="text-[11px] font-[500] text-[var(--muted-foreground)] opacity-50 w-8 shrink-0">{val}分</span>
                        <div className="flex-1 border-t border-dashed border-[var(--border)] opacity-30"></div>
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 flex items-end pl-10 pr-4 pb-10 sm:pb-6 gap-[4px] sm:gap-[3px]">
                    {chartData.map((item, idx) => {
                      const height = maxValue > 0 ? (item.value / maxValue) * 100 : 0
                      return (
                        <div key={idx} className="relative flex flex-col items-center flex-1 min-w-0 group" style={{ minHeight: '2px' }}>
                          {item.value > 0 ? (
                            <>
                              <div
                                className="w-full bg-gradient-to-t from-[#0071e3] to-[#409cff] rounded-t-[4px] transition-all duration-500 group-hover:brightness-110 shadow-[0_2px_10px_rgba(0,113,227,0.2)]"
                                style={{ height: `${Math.max(height, 2)}%`, minHeight: '2px' }}
                              />
                              <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--foreground)] text-[var(--background)] text-[10px] font-bold px-2 py-1 rounded shadow-md pointer-events-none whitespace-nowrap z-10">
                                {item.value} 分钟
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-2" style={{ opacity: 0.1 }}></div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="absolute bottom-0 left-10 right-4 flex mt-1">
                    {chartData.map((item, idx) => (
                      <span
                        key={idx}
                        className="flex-1 min-w-0 text-center text-[10px] sm:text-[10px] text-[var(--muted-foreground)] truncate tabular-nums"
                      >
                        {idx % labelInterval === 0 || idx === chartData.length - 1 ? item.label : ""}
                      </span>
                    ))}
                  </div>
                </>
              )
            })()
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-[13px]">
              暂无数据
            </div>
          )}
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-6">
          <h3 className="text-[15px] font-[600] mb-8">阅读时长排行榜</h3>
          <div className="space-y-6">
            {ranking.length === 0 ? (
              <div className="text-center py-8 text-[var(--muted-foreground)] text-[13px]">暂无数据</div>
            ) : ranking.map((book, idx) => (
              <div key={book.book_id} className="flex items-center gap-5 group">
                <span className="text-[16px] font-[700] italic text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--foreground)] w-4">{idx + 1}</span>
                <div className="w-12 h-16 rounded-md bg-[var(--secondary)] overflow-hidden shrink-0 shadow-sm">
                   <img src={`/api/v1/books/${book.book_id}/cover`} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[14px] font-[700] tracking-[-0.01em]">{formatMinutes(book.minutes)}</p>
                  </div>
                  <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5 truncate">{book.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[14px] sm:rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-3 sm:p-6 overflow-hidden">
           <div className="flex items-center justify-between mb-3 sm:mb-10">
             <h3 className="text-[14px] sm:text-[15px] font-[600]">阅读活跃度</h3>
             <div className="flex items-center gap-1.5 sm:gap-2">
               <button
                 onClick={() => setHeatmapYear((year) => year - 1)}
                 className="h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center rounded-md sm:rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] transition-colors"
               >
                 <ChevronLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
               </button>
               <span className="text-[11px] sm:text-[13px] font-[500] min-w-[48px] sm:min-w-[72px] text-center">
                 {heatmapYear}年
               </span>
               <button
                 onClick={() => setHeatmapYear((year) => year + 1)}
                 className="h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center rounded-md sm:rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] transition-colors"
               >
                 <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
               </button>
             </div>
           </div>
           {(() => {
             const { weeks: yearWeeks, monthLabels } = buildYearHeatmapData()
             const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
             const dayLabels = ['日','一','二','三','四','五','六']

             return (
               <div className="flex flex-col gap-3 sm:gap-4">
                 <div
                   className="overflow-x-auto pb-1 scrollbar-hide"
                   style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
                 >
                   <div className="inline-block">
                     <div
                       className="grid [--heatmap-cell:9px] [--heatmap-label:12px] sm:[--heatmap-cell:11px] sm:[--heatmap-label:16px]"
                       style={{
                         gridTemplateColumns: `var(--heatmap-label) repeat(${yearWeeks.length}, var(--heatmap-cell))`,
                         columnGap: "2px",
                         rowGap: "2px",
                       }}
                     >
                       {/* Month labels row */}
                       <div className="h-[16px] sm:h-[18px]"></div>
                       {yearWeeks.map((_, wi) => {
                         const ml = monthLabels.find(m => m.weekIndex === wi)
                         return (
                           <div key={`m-${wi}`} className="relative h-[16px] sm:h-[18px]">
                             {ml && <span className="absolute left-0 text-[9px] sm:text-[10px] font-[500] text-[var(--muted-foreground)] opacity-75 leading-none whitespace-nowrap">{monthNames[ml.month]}</span>}
                           </div>
                         )
                       })}

                       {/* Day labels and cells */}
                       {dayLabels.flatMap((dayLabel, di) => [
                         <div key={`label-${di}`} className="flex items-center justify-end pr-1 h-full min-w-[var(--heatmap-label)]">
                           {[1, 3, 5].includes(di) ? <span className="text-[8px] sm:text-[9px] text-[var(--muted-foreground)] opacity-55 leading-none">{dayLabel}</span> : null}
                         </div>,
                         ...yearWeeks.map((week, wi) => {
                           const day = week[di]
                           return (
                             <div
                               key={`c-${wi}-${di}`}
                               className="w-[var(--heatmap-cell)] h-[var(--heatmap-cell)] rounded-[2px] transition-all hover:ring-1 hover:ring-[var(--border)]"
                               style={{
                                 backgroundColor: ghLevelColor(day.level),
                               }}
                               title={day.minutes > 0 ? `${day.minutes} 分钟` : '无活动'}
                             />
                           )
                         })
                       ])}
                     </div>
                   </div>
                 </div>

                 {/* Legend */}
                 <div className="flex items-center justify-start sm:justify-end">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)]">少</span>
                      <div className="flex gap-[2px] sm:gap-[3px]">
                        {[0, 1, 2, 3, 4].map((l) => (
                          <div key={l} className="w-[9px] h-[9px] sm:w-[11px] sm:h-[11px] rounded-[2px]" style={{ backgroundColor: ghLevelColor(l) }} />
                        ))}
                      </div>
                      <span className="text-[10px] sm:text-[11px] text-[var(--muted-foreground)]">多</span>
                    </div>
                 </div>
               </div>
             )
           })()}
      </div>
    </div>
    </div>
  )
}

export function Home() {
  const [readingList, setReadingList] = useState<ReadingItem[]>([])
  const [readingStats, setReadingStats] = useState<ReadingStats | null>(null)

  useEffect(() => {
    const token = localStorage.getItem("folio_token")
    if (token) {
      client.get("/reading").then(({ data: resp }: any) => {
        setReadingList((resp.data || []).filter((r: ReadingItem) => r.progress < 0.99))
      }).catch(() => {})
      const tzOffset = Math.round(-new Date().getTimezoneOffset() / 60)
      client.get("/reading/stats?tz=" + tzOffset).then(({ data: resp }: any) => {
        setReadingStats(resp.data)
      }).catch(() => {})
    }
  }, [])

  return (
    <div className="p-6 lg:p-8 space-y-10 pb-24 lg:pb-8 max-w-[1200px] mx-auto">
      {/* 继续阅读 */}
      {readingList.length > 0 && (
        <section>
          <h2 className="text-[21px] font-[600] tracking-[-0.015em] text-[var(--foreground)] mb-4">
            继续阅读
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 lg:hidden scrollbar-hide">
            {readingList.slice(0, 10).map((r) => {
              const fmt = formatMap[r.format_id || 1] || "epub"
              return (
                <Link
                  key={r.book_id}
                  to={`/read/${r.book_id}/${fmt}`}
                  className="flex-shrink-0 w-[260px] flex items-center gap-4 p-4 rounded-2xl bg-[var(--card)] hover:bg-[var(--secondary)] transition-colors"
                >
                  <div
                    className="w-14 h-[76px] rounded-lg shrink-0 overflow-hidden bg-[var(--muted)] flex items-center justify-center"
                    style={{ boxShadow: "rgba(0, 0, 0, 0.12) 1px 2px 8px 0px" }}
                  >
                    <img src={`/api/v1/books/${r.book_id}/cover`} alt="" className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-[500] text-[var(--foreground)] line-clamp-2 tracking-[-0.01em]">
                      {r.book_title || `图书 #${r.book_id}`}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                        <div className="h-full rounded-full bg-[#0071e3] transition-all"
                          style={{ width: `${Math.round(r.progress * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-[500] text-[var(--muted-foreground)] shrink-0 tabular-nums">
                        {Math.round(r.progress * 100)}%
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
          <div className="hidden lg:grid grid-cols-3 gap-4">
            {readingList.slice(0, 6).map((r) => {
              const fmt = formatMap[r.format_id || 1] || "epub"
              return (
                <Link
                  key={r.book_id}
                  to={`/read/${r.book_id}/${fmt}`}
                  className="flex items-center gap-4 p-5 rounded-2xl bg-[var(--card)] hover:bg-[var(--secondary)] transition-colors"
                >
                  <div
                    className="w-16 h-[88px] rounded-lg shrink-0 overflow-hidden bg-[var(--muted)] flex items-center justify-center"
                    style={{ boxShadow: "rgba(0, 0, 0, 0.12) 1px 2px 8px 0px" }}
                  >
                    <img src={`/api/v1/books/${r.book_id}/cover`} alt="" className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-[500] text-[var(--foreground)] line-clamp-2 tracking-[-0.01em]">
                      {r.book_title || `图书 #${r.book_id}`}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                        <div className="h-full rounded-full bg-[#0071e3] transition-all"
                          style={{ width: `${Math.round(r.progress * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-[500] text-[var(--muted-foreground)] shrink-0 tabular-nums">
                        {Math.round(r.progress * 100)}%
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* 阅读统计 */}
      {readingStats && (
        <section>
          <h2 className="text-[21px] font-[600] tracking-[-0.015em] text-[var(--foreground)] mb-4">
            阅读统计
          </h2>
          <StatsChart stats={readingStats} />
        </section>
      )}
    </div>
  )
}
