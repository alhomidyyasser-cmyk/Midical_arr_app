import React, { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertCircle,
  Building2,
  FlaskConical,
  MapPin,
  Navigation,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import type {
  CenterReconciliation,
  Courier,
  CourierEvaluation,
  GeoPoint,
  SampleMovement,
} from '../types.ts';
import { formatCurrency } from '../utils/calculations.ts';

interface LiveFleetMapViewProps {
  apiKey: string;
  quotaExceeded: boolean;
  labLocation: GeoPoint;
  reconciliations: CenterReconciliation[];
  couriers: Courier[];
  evaluations: CourierEvaluation[];
  movements: SampleMovement[];
  onSelectCenter?: (centerId: string) => void;
}

const STATUS_PIN_COLORS = {
  matched: { bg: '#0B6E63', border: '#064E46', label: 'مطابق' },
  needs_review: { bg: '#D97706', border: '#92400E', label: 'ضمان للمراجعة' },
  gap: { bg: '#DC2626', border: '#991B1B', label: 'فجوة مالية' },
} as const;

interface CenterMarkerProps {
  rec: CenterReconciliation;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onCloseInfo: () => void;
}

const CenterMarker: React.FC<CenterMarkerProps> = ({
  rec,
  isSelected,
  onSelect,
  onCloseInfo,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const colors = STATUS_PIN_COLORS[rec.status];

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={rec.center.location}
        title={rec.center.name}
        onClick={() => onSelect(rec.center.id)}
      >
        <Pin
          background={colors.bg}
          borderColor={colors.border}
          glyphColor="#FFFFFF"
          scale={isSelected ? 1.25 : 1.0}
        />
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={onCloseInfo}>
          <div className="p-1 text-right font-sans" dir="rtl">
            <div className="text-xs font-bold text-slate-900">{rec.center.name}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {rec.sectorName} · {rec.center.address}
            </div>
            <div className="mt-2 space-y-1 border-t border-slate-100 pt-1.5 text-[11px] tabular-nums">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">تقرير المختبر:</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(rec.labTotalAmount)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">الموثق:</span>
                <span className="font-semibold text-emerald-700">
                  {formatCurrency(rec.approvedTotal)}
                </span>
              </div>
              {rec.gapAmount > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-red-700">الفجوة:</span>
                  <span className="font-bold text-red-700">
                    {formatCurrency(rec.gapAmount)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface CourierMarkerProps {
  evaluation: CourierEvaluation;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onCloseInfo: () => void;
}

const CourierMarker: React.FC<CourierMarkerProps> = ({
  evaluation,
  isSelected,
  onSelect,
  onCloseInfo,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const { courier } = evaluation;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={courier.currentLocation}
        title={courier.name}
        onClick={() => onSelect(`courier_${courier.id}`)}
      >
        <div
          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold shadow-md transition-transform ${
            isSelected
              ? 'scale-110 border-teal-400 bg-slate-900 text-white'
              : 'border-white bg-slate-900/95 text-white'
          }`}
        >
          <Truck className="h-3 w-3 text-teal-300" />
          <span>{courier.name.split(' ')[0]}</span>
        </div>
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={240} onCloseClick={onCloseInfo}>
          <div className="p-1 text-right font-sans" dir="rtl">
            <div className="text-xs font-bold text-slate-900">{courier.name}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {evaluation.sectorName} · {courier.phone}
            </div>
            <div className="mt-2 space-y-1 border-t border-slate-100 pt-1.5 text-[11px] tabular-nums">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">التقييم الموزون:</span>
                <span className="font-bold text-[#0B6E63]">
                  {evaluation.weightedFinalScore} نقطة
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">النقد التراكمي:</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(evaluation.approvedCashTotal)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">مؤشر الجدية:</span>
                <span className="font-semibold text-slate-900">
                  {evaluation.effortScore}/100
                </span>
              </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface RouteOverlayProps {
  labLocation: GeoPoint;
  couriers: Courier[];
  reconciliations: CenterReconciliation[];
  movements: SampleMovement[];
  focusTarget: GeoPoint | null;
}

const RouteOverlay: React.FC<RouteOverlayProps> = ({
  labLocation,
  couriers,
  reconciliations,
  movements,
  focusTarget,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !focusTarget) return;
    map.panTo(focusTarget);
    map.setZoom(14);
  }, [map, focusTarget]);

  useEffect(() => {
    if (!map || !mapsLib) return;

    const polylines: Array<{ setMap: (m: null) => void }> = [];
    const centerLookup: Record<string, GeoPoint> = {};
    reconciliations.forEach((r) => {
      centerLookup[r.center.id] = r.center.location;
    });

    couriers.forEach((courier) => {
      const activeMovements = movements.filter(
        (m) => m.courierId === courier.id && m.status !== 'returned_to_center'
      );
      const path: GeoPoint[] = [courier.currentLocation];
      activeMovements.forEach((m) => {
        const pt = centerLookup[m.centerId];
        if (pt) path.push(pt);
      });
      path.push(labLocation);

      if (path.length >= 2) {
        const line = new mapsLib.Polyline({
          path,
          geodesic: true,
          strokeColor: '#0B6E63',
          strokeOpacity: 0.55,
          strokeWeight: 2.5,
          map,
        });
        polylines.push(line);
      }
    });

    return () => {
      polylines.forEach((p) => p.setMap(null));
    };
  }, [map, mapsLib, labLocation, couriers, reconciliations, movements]);

  return null;
};

export const LiveFleetMapView: React.FC<LiveFleetMapViewProps> = ({
  apiKey,
  quotaExceeded,
  labLocation,
  reconciliations,
  couriers,
  evaluations,
  movements,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<'all' | 'north' | 'central' | 'south'>('all');
  const [focusPoint, setFocusPoint] = useState<GeoPoint | null>(null);
  const [labMarkerRef, labMarker] = useAdvancedMarkerRef();

  const filteredRecons = useMemo(
    () =>
      reconciliations.filter((r) =>
        sectorFilter === 'all' ? true : r.center.sectorId === sectorFilter
      ),
    [reconciliations, sectorFilter]
  );

  const filteredEvals = useMemo(
    () =>
      evaluations.filter((e) =>
        sectorFilter === 'all' ? true : e.courier.sectorId === sectorFilter
      ),
    [evaluations, sectorFilter]
  );

  const centerLookup: Record<string, CenterReconciliation> = {};
  reconciliations.forEach((r) => {
    centerLookup[r.center.id] = r;
  });

  const canRenderGoogleMap = Boolean(apiKey) && !quotaExceeded;

  const allPoints = [
    labLocation,
    ...reconciliations.map((r) => r.center.location),
    ...couriers.map((c) => c.currentLocation),
  ];
  const minLat = Math.min(...allPoints.map((p) => p.lat)) - 0.008;
  const maxLat = Math.max(...allPoints.map((p) => p.lat)) + 0.008;
  const minLng = Math.min(...allPoints.map((p) => p.lng)) - 0.008;
  const maxLng = Math.max(...allPoints.map((p) => p.lng)) + 0.008;

  const projectPoint = (pt: GeoPoint) => {
    const x = ((pt.lng - minLng) / Math.max(0.001, maxLng - minLng)) * 740 + 30;
    const y = ((maxLat - pt.lat) / Math.max(0.001, maxLat - minLat)) * 460 + 30;
    return { x, y };
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0B6E63]/10 text-[#0B6E63]">
            <Navigation className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900">
              خريطة تتبع المراسلين والمراكز الطبية — صنعاء
            </h2>
            <p className="text-xs text-slate-500">
              توزيع المراكز حسب حالة المطابقة المالية ومسارات دفعات العينات نحو المختبر المركزي
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-100 p-1">
          {(
            [
              { key: 'all', label: 'جميع القطاعات' },
              { key: 'north', label: 'الشمالي' },
              { key: 'central', label: 'الأوسط' },
              { key: 'south', label: 'الجنوبي' },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setSectorFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                sectorFilter === f.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-4 text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#0B6E63]" />
                <span>مطابق</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
                <span>ضمان للمراجعة</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
                <span>فجوة مالية</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-900" />
                <span>مراسل ميداني</span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setFocusPoint(labLocation);
              }}
              className="text-xs font-semibold text-[#0B6E63] hover:underline whitespace-nowrap"
            >
              التركيز على المختبر المركزي
            </button>
          </div>

          <div className="relative h-[560px] w-full bg-slate-100">
            {canRenderGoogleMap ? (
              <APIProvider apiKey={apiKey} libraries={['marker']} language="ar" region="YE">
                <GoogleMap
                  mapId="DEMO_MAP_ID"
                  defaultCenter={labLocation}
                  defaultZoom={13}
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  <RouteOverlay
                    labLocation={labLocation}
                    couriers={filteredEvals.map((e) => e.courier)}
                    reconciliations={filteredRecons}
                    movements={movements}
                    focusTarget={focusPoint}
                  />

                  <AdvancedMarker
                    ref={labMarkerRef}
                    position={labLocation}
                    title="المختبر المركزي الرئيسي"
                    onClick={() => setSelectedId('lab_hub')}
                  >
                    <div className="flex items-center gap-1.5 rounded-xl border-2 border-white bg-[#0B6E63] px-3 py-1.5 text-xs font-bold text-white shadow-lg">
                      <FlaskConical className="h-3.5 w-3.5" />
                      <span>المختبر المركزي</span>
                    </div>
                  </AdvancedMarker>
                  {selectedId === 'lab_hub' && labMarker && (
                    <InfoWindow
                      anchor={labMarker}
                      maxWidth={220}
                      onCloseClick={() => setSelectedId(null)}
                    >
                      <div className="p-1 text-right font-sans" dir="rtl">
                        <div className="text-xs font-bold text-[#0B6E63]">
                          المختبر المركزي الرئيسي
                        </div>
                        <div className="mt-1 text-[11px] text-slate-600">
                          نقطة تجميع العينات وإصدار تقارير المطابقة اليومية
                        </div>
                      </div>
                    </InfoWindow>
                  )}

                  {filteredRecons.map((rec) => (
                    <CenterMarker
                      key={rec.center.id}
                      rec={rec}
                      isSelected={selectedId === rec.center.id}
                      onSelect={(id) => setSelectedId(id)}
                      onCloseInfo={() => setSelectedId(null)}
                    />
                  ))}

                  {filteredEvals.map((ev) => (
                    <CourierMarker
                      key={ev.courier.id}
                      evaluation={ev}
                      isSelected={selectedId === `courier_${ev.courier.id}`}
                      onSelect={(id) => setSelectedId(id)}
                      onCloseInfo={() => setSelectedId(null)}
                    />
                  ))}
                </GoogleMap>
              </APIProvider>
            ) : (
              <div className="relative h-full w-full bg-[#F1F5F9] p-4">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                  <span>المخطط الإحداثي المباشر لشبكة صنعاء</span>
                  <span className="font-mono-num text-[11px] text-slate-400">
                    {labLocation.lat.toFixed(4)}, {labLocation.lng.toFixed(4)}
                  </span>
                </div>
                <svg viewBox="0 0 800 520" className="h-[490px] w-full rounded-lg border border-slate-200 bg-white">
                  <defs>
                    <pattern id="mapGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path
                        d="M 40 0 L 0 0 0 40"
                        fill="none"
                        stroke="#E2E8F0"
                        strokeWidth="0.7"
                      />
                    </pattern>
                  </defs>
                  <rect width="800" height="520" fill="url(#mapGrid)" />

                  {filteredEvals.map((ev) => {
                    const cPt = projectPoint(ev.courier.currentLocation);
                    const lPt = projectPoint(labLocation);
                    return (
                      <line
                        key={`route_${ev.courier.id}`}
                        x1={cPt.x}
                        y1={cPt.y}
                        x2={lPt.x}
                        y2={lPt.y}
                        stroke="#0B6E63"
                        strokeOpacity="0.35"
                        strokeWidth="2"
                        strokeDasharray="5 4"
                      />
                    );
                  })}

                  {(() => {
                    const lPt = projectPoint(labLocation);
                    return (
                      <g transform={`translate(${lPt.x}, ${lPt.y})`}>
                        <circle r="13" fill="#0B6E63" />
                        <text
                          y="26"
                          textAnchor="middle"
                          className="fill-[#0B6E63] text-[11px] font-bold"
                        >
                          المختبر المركزي
                        </text>
                      </g>
                    );
                  })()}

                  {filteredRecons.map((rec) => {
                    const pt = projectPoint(rec.center.location);
                    const color = STATUS_PIN_COLORS[rec.status].bg;
                    return (
                      <g
                        key={rec.center.id}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        onClick={() => setSelectedId(rec.center.id)}
                        className="cursor-pointer"
                      >
                        <circle
                          r={selectedId === rec.center.id ? 10 : 7.5}
                          fill={color}
                          stroke="#FFFFFF"
                          strokeWidth="2"
                        />
                        <text
                          y="-12"
                          textAnchor="middle"
                          className="fill-slate-800 text-[10px] font-semibold"
                        >
                          {rec.center.name.replace('مركز ', '').replace('مستشفى ', '')}
                        </text>
                      </g>
                    );
                  })}

                  {filteredEvals.map((ev) => {
                    const pt = projectPoint(ev.courier.currentLocation);
                    return (
                      <g
                        key={ev.courier.id}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        onClick={() => setSelectedId(`courier_${ev.courier.id}`)}
                        className="cursor-pointer"
                      >
                        <rect
                          x="-24"
                          y="-11"
                          width="48"
                          height="22"
                          rx="6"
                          fill="#0F172A"
                        />
                        <text
                          y="3"
                          textAnchor="middle"
                          className="fill-white text-[10px] font-bold"
                        >
                          {ev.courier.name.split(' ')[0]}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Truck className="h-4 w-4 text-[#0B6E63]" />
                <span>المراسلون الميدانيون ({filteredEvals.length})</span>
              </div>
            </div>
            <div className="mt-3 space-y-2.5">
              {filteredEvals.map((ev) => {
                const activeCount = movements.filter(
                  (m) =>
                    m.courierId === ev.courier.id && m.status !== 'returned_to_center'
                ).length;
                return (
                  <button
                    key={ev.courier.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(`courier_${ev.courier.id}`);
                      setFocusPoint(ev.courier.currentLocation);
                    }}
                    className={`w-full rounded-lg border p-3 text-right transition-colors ${
                      selectedId === `courier_${ev.courier.id}`
                        ? 'border-[#0B6E63] bg-teal-50/40'
                        : 'border-slate-200/80 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">{ev.courier.name}</span>
                      <span className="font-mono-num font-bold text-[#0B6E63]">
                        {ev.weightedFinalScore} نقطة
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{ev.sectorName}</span>
                      <span>{activeCount} حركة نشطة</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Building2 className="h-4 w-4 text-[#0B6E63]" />
                <span>المراكز الطبية ({filteredRecons.length})</span>
              </div>
            </div>
            <div className="mt-3 max-h-[275px] space-y-2 overflow-y-auto pl-1">
              {filteredRecons.map((rec) => (
                <button
                  key={rec.center.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(rec.center.id);
                    setFocusPoint(rec.center.location);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-right transition-colors ${
                    selectedId === rec.center.id
                      ? 'border-[#0B6E63] bg-teal-50/40'
                      : 'border-slate-200/80 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-slate-900">
                      {rec.center.name}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">
                      {rec.center.address}
                    </div>
                  </div>
                  <div className="shrink-0 text-left text-[11px] font-semibold">
                    {rec.status === 'matched' && (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <MapPin className="h-3 w-3" />
                        مطابق
                      </span>
                    )}
                    {rec.status === 'needs_review' && (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <ShieldAlert className="h-3 w-3" />
                        ضمان
                      </span>
                    )}
                    {rec.status === 'gap' && (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <AlertCircle className="h-3 w-3" />
                        فجوة
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
