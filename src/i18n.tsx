import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SegmentedControl } from '@mantine/core';

export type Locale = 'en' | 'zh-TW';

type TranslationKey = keyof typeof translations.en;
type TranslationParams = Record<string, string | number>;

const zhRouteTranslations = {
  optimizeRoute: '最佳化路線', refreshRoute: '重新整理路線', routeStale: '路線需要重新整理', routeReady: '路線已更新', routeUnavailable: '找不到路線。請保留此順序或手動選擇交通方式。', routeDemo: '示範模式無法使用路線最佳化，請登入後使用 Google Routes。', dayDefault: '使用當日預設', publicTransport: '大眾運輸', walk: '步行', bike: '自行車', car: '開車', taxi: '計程車', otherTransport: '其他', travelTo: '前往 {name}', routeDuration: '{minutes} 分鐘', routeDistance: '{distance} 公里', routeDetails: '路線詳情', routeLoading: '正在規劃路線…', routeMode: '交通方式', stayAt: '住宿地點', manageTimes: '管理時間', hideTimeManagement: '隱藏時間管理', routeError: '路線更新失敗', plannedStop: '安排停靠點', lunchDinner: '午餐／晚餐 — 尚未決定', coffeeBreak: '咖啡休息 — 尚未決定', freeTime: '自由時間', customStop: '自訂停靠點', choosePlace: '選擇景點', renamePlannedStop: '重新命名停靠點',
} as const;

const translations = {
  en: {
    language: 'Language', english: 'English', traditionalChinese: '繁中',
    loadingTrip: 'Loading your synchronized trip…', restoringTrip: 'Restoring your trip…', stopsCount: '{count} stops',
    startsSummary: 'Starts {date} · {days} days · {places} places',
    loading: 'Loading', saving: 'Saving…', saved: 'Saved', syncFailed: 'Sync failed',
    syncDescription: 'Your itinerary is synchronized with Supabase.', addPlace: 'Add place', tripSettings: 'Trip settings', moreActions: 'More trip actions',
    localDemoData: 'Local demo data', cloudStatus: 'Cloud status: {status}', exportItinerary: 'Export itinerary', copyItineraryText: 'Copy itinerary text',
    preparingExcel: 'Preparing Excel…', excelWorkbook: 'Excel workbook (.xls)', preparingNote: 'Preparing note…', markdownNote: 'Markdown note (.md)', jsonBackup: 'JSON backup (.json)',
    resetDemoData: 'Reset demo data', signInToSync: 'Sign in to sync', signOut: 'Sign out',
    excelExported: 'Excel itinerary exported', markdownExported: 'Markdown note exported', latestScheduleDownloaded: 'The latest synchronized schedule was downloaded.', exportFailed: 'Export failed', unableExport: 'Unable to export the itinerary.', noSynchronizedTrip: 'No synchronized trip was found.',
    placesOfInterest: 'Places of interest', placesCount: '{shown} of {total} places', searchPlaceRegion: 'Search a place or region', searchPlaces: 'Search places', noPlacesFilter: 'No places match this filter.', all: 'All', landmark: 'Landmark', nature: 'Nature', culture: 'Culture', food: 'Food', shopping: 'Shopping', relaxation: 'Relaxation', accommodation: 'Hotel / dormitory',
    editPlace: 'Edit place', deletePlace: 'Delete place', actionsFor: 'Actions for {name}', markVisited: 'Mark {name} as visited', noNotes: 'No notes added yet.', selectPlace: 'Select a map marker or place card to see its notes.',
    itinerary: 'Itinerary', itineraryHint: 'Drag places between days to shape your route.', addDay: 'Add day', day: 'Day {number}', expandDay: 'Expand day', collapseDay: 'Collapse day', removeDay: 'Remove day', stopsVisited: '{stops} stops · {visited} visited', dayTitle: 'Day {number} title', dropPlace: 'Drop a place here',
    unscheduled: 'Unscheduled', spots: '{count} spots', expandUnscheduled: 'Expand unscheduled places', collapseUnscheduled: 'Collapse unscheduled places', unscheduledHint: 'Ideas ready to be placed into a day', dropPlacesLater: 'Drop places here to plan them later',
    tripWorkspace: 'Trip workspace', workspaceHint: 'Explore on the map or fine-tune the full itinerary board.', map: 'Map', planner: 'Planner', details: 'Details', places: 'Places', selectedPlace: 'Selected place', addFirstPlace: 'Add your first place', navigation: 'Trip planner navigation',
    deletePlaceQuestion: 'Delete place?', removePlaceConfirm: 'Remove {name} from the map and every itinerary day?', assignedVisits: 'Assigned planner visits ({count})', noPlannerVisits: 'This place is not assigned in the planner.', removePlaceAndVisits: 'Remove place and {count} visits', cancel: 'Cancel',
    removeDayQuestion: 'Remove day?', removeDayConfirm: 'Remove Day {number}? Its {count} stops will be moved to Unscheduled.',
    placeUpdated: 'Place updated', placeSaved: '{name} was saved.', placeAdded: 'Place added', placeReady: '{name} is ready to schedule.', placeRemoved: 'Place removed', placeDeleted: '{name} was deleted.', dayRemoved: 'Day removed', stopsMoved: '{count} stops moved to Unscheduled.', itineraryCopied: 'Itinerary copied', itineraryCopiedMessage: 'Plain text itinerary copied to your clipboard.', copyFailed: 'Copy failed', clipboardDenied: 'Your browser did not allow clipboard access.', demoRestored: 'Demo restored', demoRestoredMessage: 'The sample trip has been reset.',
    openRoute: 'Open route', fullScreenMap: 'Full screen map', exitFullScreen: 'Exit full screen', openFullScreenMap: 'Open full screen map', noPlacesView: 'No places in this view', addOrMovePlace: 'Add a place or move one into this itinerary day.', completeOverview: 'Complete trip overview', visiblePlaces: '{count} places visible', unscheduledPlaces: 'Unscheduled places', untitledDay: 'Untitled day', stop: 'Stop {number}', addItineraryDay: 'Add itinerary day', itineraryDaySelector: 'Itinerary day selector',
    tripName: 'Trip name', startDate: 'Start date', saveTrip: 'Save trip', enterTripName: 'Enter a trip name', chooseStartDate: 'Choose a start date',
    searchForPlace: 'Search for a place', searchExample: 'e.g. Raohe Night Market', searchDisabled: 'Add a Geoapify API key to enable search', searchDescription: 'Search places anywhere and fill the coordinates automatically.', placeName: 'Place name', regionCity: 'Region or city', cityPlaceholder: 'Taipei', category: 'Category', placeType: 'Place type', typePlace: 'Place', typeHotel: 'Hotel', typeAirport: 'Airport', typeStation: 'Rail / bus station', typeTransit: 'Transit point', latitude: 'Latitude', longitude: 'Longitude', opensAt: 'Opens', closesAt: 'Closes', notes: 'Notes', notesPlaceholder: 'Food to try, ideal visiting time, transport notes…', addToUnscheduled: 'Add to unscheduled', saveChanges: 'Save changes', enterPlaceName: 'Enter a place name', enterRegion: 'Enter a region or city', validLatitude: 'Use a valid latitude', validLongitude: 'Use a valid longitude',
    openTaiwanTrip: 'Open your trip planner', signInHint: 'Sign in with the same email on your laptop and mobile to keep every trip synchronized.', supabaseMissing: 'Supabase is not configured', supabaseMissingHint: 'Add the Vite Supabase environment variables before deploying the application.', signInFailed: 'Sign-in failed', checkEmail: 'Check your email', checkEmailHint: 'Open the sign-in link on this device. You can close this message after the planner opens.', emailAddress: 'Email address', emailSignIn: 'Email me a sign-in link', demoMode: 'Continue in demo mode', demoHint: 'Demo changes are saved only in this browser and are not synchronized.', allStopsVisited: 'All stops visited', optimizeRoute: 'Optimize route', refreshRoute: 'Refresh route', routeStale: 'Route needs refresh', routeReady: 'Route updated', routeUnavailable: 'No route found. Keep this order or choose a mode manually.', routeDemo: 'Route optimization is unavailable in demo mode. Sign in to use Google Routes.', dayDefault: 'Use day default', publicTransport: 'Public transport', walk: 'Walk', bike: 'Cycling', car: 'Driving', taxi: 'Taxi', otherTransport: 'Other', travelTo: 'Travel to {name}', routeDuration: '{minutes} min', routeDistance: '{distance} km', routeDetails: 'Route details', routeLoading: 'Planning route…', routeMode: 'Transport mode', stayAt: 'Stay at', manageTimes: 'Manage times', hideTimeManagement: 'Hide time management', routeError: 'Route update failed', plannedStop: 'Plan stop', lunchDinner: 'Lunch / dinner — undecided', coffeeBreak: 'Coffee break — undecided', freeTime: 'Free time', customStop: 'Custom stop', choosePlace: 'Choose place', renamePlannedStop: 'Rename planned stop',
    checkInDate: 'Check-in date',
    checkOutDate: 'Check-out date',
  },
  'zh-TW': {
    language: '語言', english: 'English', traditionalChinese: '繁中', loadingTrip: '正在載入同步行程…', restoringTrip: '正在還原行程…', stopsCount: '{count} 個停靠點', startsSummary: '{date} 出發 · {days} 天 · {places} 個景點', loading: '載入中', saving: '儲存中…', saved: '已儲存', syncFailed: '同步失敗', syncDescription: '你的行程已與 Supabase 同步。', addPlace: '新增景點', tripSettings: '行程設定', moreActions: '更多行程操作', localDemoData: '本機示範資料', cloudStatus: '雲端狀態：{status}', exportItinerary: '匯出行程', copyItineraryText: '複製行程文字', preparingExcel: '正在準備 Excel…', excelWorkbook: 'Excel 活頁簿（.xls）', preparingNote: '正在準備筆記…', markdownNote: 'Markdown 筆記（.md）', jsonBackup: 'JSON 備份（.json）', resetDemoData: '重設示範資料', signInToSync: '登入以同步', signOut: '登出', excelExported: 'Excel 行程已匯出', markdownExported: 'Markdown 筆記已匯出', latestScheduleDownloaded: '最新的同步行程已下載。', exportFailed: '匯出失敗', unableExport: '無法匯出行程。', noSynchronizedTrip: '找不到同步行程。', placesOfInterest: '景點清單', placesCount: '{shown} / {total} 個景點', searchPlaceRegion: '搜尋景點或地區', searchPlaces: '搜尋景點', noPlacesFilter: '沒有符合篩選條件的景點。', all: '全部', landmark: '地標', nature: '自然', culture: '文化', food: '美食', shopping: '購物', relaxation: '休閒', editPlace: '編輯景點', deletePlace: '刪除景點', actionsFor: '{name} 的操作', markVisited: '標記 {name} 已造訪', noNotes: '尚未新增備註。', selectPlace: '選取地圖標記或景點卡片以查看備註。', itinerary: '行程規劃', itineraryHint: '在不同天之間拖曳景點，安排你的路線。', addDay: '新增一天', day: '第 {number} 天', expandDay: '展開日期', collapseDay: '收合日期', removeDay: '移除日期', stopsVisited: '{stops} 個停靠點 · 已造訪 {visited} 個', allStopsVisited: '所有停靠點皆已造訪', dayTitle: '第 {number} 天標題', dropPlace: '將景點拖曳至此', unscheduled: '未排程', spots: '{count} 個景點', expandUnscheduled: '展開未排程景點', collapseUnscheduled: '收合未排程景點', unscheduledHint: '準備放入行程的景點靈感', dropPlacesLater: '將景點拖曳至此，稍後安排', tripWorkspace: '行程工作區', workspaceHint: '在地圖探索，或微調完整行程看板。', map: '地圖', planner: '規劃表', details: '詳細資料', places: '景點', selectedPlace: '選取的景點', addFirstPlace: '新增第一個景點', navigation: '行程規劃導覽', deletePlaceQuestion: '刪除景點？', removePlaceConfirm: '要從地圖和所有行程日期移除 {name} 嗎？', cancel: '取消', removeDayQuestion: '移除日期？', removeDayConfirm: '要移除第 {number} 天嗎？其中 {count} 個停靠點會移至未排程。', placeUpdated: '景點已更新', placeSaved: '{name} 已儲存。', placeAdded: '景點已新增', placeReady: '{name} 已準備安排。', placeRemoved: '景點已移除', placeDeleted: '{name} 已刪除。', dayRemoved: '日期已移除', stopsMoved: '{count} 個停靠點已移至未排程。', itineraryCopied: '行程已複製', itineraryCopiedMessage: '純文字行程已複製到剪貼簿。', copyFailed: '複製失敗', clipboardDenied: '瀏覽器不允許存取剪貼簿。', demoRestored: '示範已還原', demoRestoredMessage: '示範行程已重設。', openRoute: '開啟路線', fullScreenMap: '全螢幕地圖', exitFullScreen: '離開全螢幕', openFullScreenMap: '開啟全螢幕地圖', noPlacesView: '此檢視沒有景點', addOrMovePlace: '新增景點，或將景點移入這個行程日期。', completeOverview: '完整行程總覽', visiblePlaces: '{count} 個景點', unscheduledPlaces: '未排程景點', untitledDay: '未命名日期', stop: '第 {number} 個停靠點', addItineraryDay: '新增行程日期', itineraryDaySelector: '行程日期選擇器', tripName: '行程名稱', startDate: '開始日期', saveTrip: '儲存行程', enterTripName: '請輸入行程名稱', chooseStartDate: '請選擇開始日期', searchForPlace: '搜尋景點', searchExample: '例如：饒河街觀光夜市', searchDisabled: '新增 Geoapify API 金鑰以啟用搜尋', searchDescription: '搜尋任何地點並自動填入座標。', placeName: '景點名稱', regionCity: '地區或城市', cityPlaceholder: '台北', category: '類別', placeType: '地點類型', typePlace: '景點', typeHotel: '住宿', typeAirport: '機場', typeStation: '火車／公車站', typeTransit: '轉乘點', latitude: '緯度', longitude: '經度', opensAt: '開放時間', closesAt: '結束時間', notes: '備註', notesPlaceholder: '想吃的美食、適合造訪時間、交通備註…', addToUnscheduled: '加入未排程', saveChanges: '儲存變更', enterPlaceName: '請輸入景點名稱', enterRegion: '請輸入地區或城市', validLatitude: '請輸入有效緯度', validLongitude: '請輸入有效經度', openTaiwanTrip: '開啟你的行程規劃器', signInHint: '使用相同電子郵件登入筆電與手機，讓所有行程保持同步。', supabaseMissing: '尚未設定 Supabase', supabaseMissingHint: '部署應用程式前，請加入 Vite Supabase 環境變數。', signInFailed: '登入失敗', checkEmail: '請查收電子郵件', checkEmailHint: '請在此裝置開啟登入連結。行程開啟後即可關閉此訊息。', emailAddress: '電子郵件地址', emailSignIn: '寄送登入連結給我', demoMode: '繼續使用示範模式', demoHint: '示範模式變更只會儲存在此瀏覽器，不會同步。',
    accommodation: '住宿／宿舍', assignedVisits: '已安排的行程停靠點（{count}）', noPlannerVisits: '此景點尚未安排至行程。', removePlaceAndVisits: '移除景點與 {count} 個停靠點',
    checkInDate: '入住日期',
    checkOutDate: '退房日期',
    ...zhRouteTranslations,
  },
} as const;

interface I18nValue { locale: Locale; setLocale: (locale: Locale) => void; t: (key: TranslationKey, params?: TranslationParams) => string; }
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => (localStorage.getItem('trip-planner-locale') as Locale) || 'en');
  useEffect(() => { localStorage.setItem('trip-planner-locale', locale); document.documentElement.lang = locale === 'zh-TW' ? 'zh-Hant-TW' : 'en'; }, [locale]);
  const value = useMemo(() => ({
    locale,
    setLocale,
    t: (key: TranslationKey, params: TranslationParams = {}) => {
      let text: string = translations[locale][key] as string;
      Object.entries(params).forEach(([name, replacement]) => {
        text = text.replace(`{${name}}`, String(replacement));
      });
      return text;
    },
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() { const value = useContext(I18nContext); if (!value) throw new Error('useI18n must be used inside I18nProvider.'); return value; }

export function categoryLabel(t: I18nValue['t'], category: string) {
  const key = ({ Landmark: 'landmark', Nature: 'nature', Culture: 'culture', Food: 'food', Shopping: 'shopping', Relaxation: 'relaxation', Accommodation: 'accommodation' } as Record<string, TranslationKey>)[category];
  return key ? t(key) : category;
}

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return <SegmentedControl aria-label={t('language')} size="xs" value={locale} onChange={(value) => setLocale(value as Locale)} data={[{ label: 'EN', value: 'en' }, { label: t('traditionalChinese'), value: 'zh-TW' }]} />;
}
