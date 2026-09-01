import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Siren, Phone, MapPin, Hospital, AlertTriangle, CheckCircle2, XCircle,
  Navigation, Loader2, ExternalLink, MessageCircle,
} from 'lucide-react';

import { PageHeader } from '../../components/DashboardLayout.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { HospitalMap } from '../../components/HospitalMap.jsx';
import { sosApi } from '../../api/sos.js';
import { toApiError } from '../../api/client.js';
import { useGeolocation } from '../../hooks/useGeolocation.js';
import { findNearbyHospitals } from '../../lib/hospitals.js';

const formatDistance = (metres) =>
  metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;

export default function Emergency() {
  const { t } = useTranslation();
  const { position, status: geoStatus, errorCode, locate } = useGeolocation();

  const [hospitals, setHospitals] = useState([]);
  const [hospitalSource, setHospitalSource] = useState(null);
  const [searchedRadius, setSearchedRadius] = useState(null);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const { data: info } = useQuery({
    queryKey: ['sos', 'info'],
    queryFn: () => sosApi.info(),
  });

  // Locate on arrival: in an emergency nobody should have to press a button
  // just to start finding out where they are.
  useEffect(() => {
    locate().then((pos) => {
      if (pos) loadHospitals(pos);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHospitals = async (pos) => {
    setLoadingHospitals(true);
    try {
      const { hospitals: found, source, searchedRadius: usedRadius } =
        await findNearbyHospitals(
          pos.latitude,
          pos.longitude,
          info?.searchRadiusMeters ?? 5000
        );
      setHospitals(found);
      setHospitalSource(source);
      setSearchedRadius(usedRadius);
    } finally {
      setLoadingHospitals(false);
    }
  };

  const sendAlert = async () => {
    setSending(true);
    setError('');
    try {
      const data = await sosApi.trigger({
        ...(position ?? {}),
        hospitalCount: hospitals.length,
      });
      setResult(data.event);
      setConfirming(false);
    } catch (err) {
      setError(toApiError(err).message);
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  const ambulance = info?.ambulanceNumber ?? '108';
  const helpline = info?.emergencyHelpline ?? '112';
  const contact = info?.emergencyContact;
  const mapLink = position
    ? `https://www.openstreetmap.org/?mlat=${position.latitude}&mlon=${position.longitude}#map=17/${position.latitude}/${position.longitude}`
    : '';

  return (
    <>
      <PageHeader title={t('sos.title')} subtitle={t('sos.subtitle')} />

      {/* Call first. Everything else on this page is secondary to this. */}
      <div className="card border-red-200 bg-red-50 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="rounded-full bg-red-600 p-3 text-white">
            <Siren className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-red-900">{t('sos.callAmbulance')}</h2>
            <p className="text-sm text-red-700">{t('sos.callAmbulanceHint')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${ambulance}`} className="btn-danger px-6 py-3 text-base">
              <Phone className="h-5 w-5" aria-hidden="true" />
              {ambulance}
            </a>
            <a href={`tel:${helpline}`} className="btn-secondary px-5 py-3">
              <Phone className="h-4 w-4" aria-hidden="true" />
              {helpline}
            </a>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Outcome of an alert, stated plainly rather than assumed. */}
      {result && (
        <div className="card mt-4 border-slate-200 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            {t('sos.alertRecorded')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              {result.emailSent
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />}
              <span className={result.emailSent ? 'text-slate-700' : 'text-amber-700'}>
                {result.emailSent
                  ? t('sos.emailSent', { name: result.contactName || t('sos.yourContact') })
                  : t('sos.emailNotSent', { reason: result.emailError })}
                {/* Only present when a test inbox took the message. */}
                {result.emailPreviewUrl && (
                  <>
                    {' '}
                    <a
                      href={result.emailPreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand-700 underline"
                    >
                      {t('sos.openSentEmail')}
                    </a>
                  </>
                )}
              </span>
            </li>
            {(result.whatsappSent || result.whatsappError) && (
              <li className="flex items-start gap-2">
                {result.whatsappSent
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                <span className={result.whatsappSent ? 'text-slate-700' : 'text-slate-500'}>
                  {result.whatsappSent ? t('sos.whatsappSent') : t('sos.whatsappNotSent', { reason: result.whatsappError })}
                </span>
              </li>
            )}
          </ul>

          {/* The automated send can fail for a dozen setup reasons. This one
              cannot: it is a plain wa.me link, already filled in. Offered
              whenever the alert did not go out on its own, so there is always
              a way to reach the contact on WhatsApp right now. */}
          {result.whatsappLink && !result.whatsappSent && (
            <a
              href={result.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-3.5 w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              {t('sos.whatsappOpen', { name: result.contactName || t('sos.yourContact') })}
            </a>
          )}

          <p className="mt-3 text-sm font-medium text-red-700">{t('sos.stillCall', { number: ambulance })}</p>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Alert the emergency contact */}
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">{t('sos.alertContactTitle')}</h2>

          {!contact?.hasEmail && !contact?.hasWhatsapp ? (
            <div className="mt-3 flex gap-2.5 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p>{t('sos.noContact')}</p>
                <Link to="/patient/profile" className="mt-1 inline-block font-semibold underline">
                  {t('patient.addEmergencyContact')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">
                {t('sos.willAlert', {
                  name: contact.name || t('sos.yourContact'),
                  relation: contact.relation ? ` (${contact.relation})` : '',
                })}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {contact.emailMasked}
                {contact.hasWhatsapp && ` · ${t('sos.andWhatsapp')}`}
              </p>

              {/* Whether WhatsApp will fire on its own is the difference between
                  one tap and three during an emergency, so it is stated before
                  the button rather than discovered after it. */}
              {contact.whatsappNeedsOptIn ? (
                <div className="mt-3 flex gap-2.5 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p>{t('sos.whatsappManualWarning')}</p>
                    <Link to="/patient/profile" className="mt-1 inline-block font-semibold underline">
                      {t('sos.whatsappEnableAuto')}
                    </Link>
                  </div>
                </div>
              ) : contact.hasWhatsapp ? (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t('sos.whatsappAutoReady')}
                </p>
              ) : null}

              {!confirming ? (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={sending || Boolean(result)}
                  className="btn-danger mt-4 w-full py-3 text-base"
                >
                  <Siren className="h-5 w-5" aria-hidden="true" />
                  {result ? t('sos.alreadySent') : t('sos.sendAlert')}
                </button>
              ) : (
                // A deliberate second step: this emails a real person.
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3.5">
                  <p className="text-sm font-medium text-red-800">{t('sos.confirmTitle')}</p>
                  <p className="mt-1 text-sm text-red-700">
                    {position ? t('sos.confirmWithLocation') : t('sos.confirmNoLocation')}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={sendAlert} disabled={sending} className="btn-danger flex-1">
                      {sending && <Spinner className="h-4 w-4" />}
                      {t('sos.confirmSend')}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Location */}
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <MapPin className="h-4.5 w-4.5 text-slate-400" aria-hidden="true" />
            {t('sos.yourLocation')}
          </h2>

          {geoStatus === 'locating' && (
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('sos.locating')}
            </p>
          )}

          {geoStatus === 'error' && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <p>{t(`sos.geo_${errorCode}`, t('sos.geo_unknown'))}</p>
              <button
                type="button"
                onClick={() => locate().then((pos) => pos && loadHospitals(pos))}
                className="mt-2 font-semibold underline"
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {position && (
            <>
              <p className="mt-3 font-mono text-sm text-slate-700">
                {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
              </p>
              <p className="text-xs text-slate-500">
                {t('sos.accuracy', { metres: position.accuracyMeters })}
              </p>
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary mt-3"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t('sos.openInMaps')}
              </a>
            </>
          )}
        </section>
      </div>

      {/* Nearby hospitals */}
      <section className="card mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Hospital className="h-4.5 w-4.5 text-slate-400" aria-hidden="true" />
            {t('sos.nearbyHospitals')}
          </h2>
          {hospitals.length > 0 && searchedRadius && (
            <span className="text-xs text-slate-500">
              {t('sos.withinRadius', { km: Math.round(searchedRadius / 1000) })}
            </span>
          )}
        </div>

        {loadingHospitals && (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t('sos.searchingHospitals')}
          </p>
        )}

        {/* A bundled entry is never presented as though it were live data. */}
        {!loadingHospitals && hospitalSource === 'fallback' && (
          <div className="mt-3 flex gap-2.5 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{t('sos.fallbackExplained')}</p>
          </div>
        )}

        {!loadingHospitals && position && hospitalSource === 'none' && (
          <div className="mt-3 flex gap-2.5 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p>{t('sos.noHospitals', { km: Math.round((searchedRadius ?? 20000) / 1000) })}</p>
              <a href={`tel:${ambulance}`} className="btn-danger mt-3">
                <Phone className="h-4 w-4" aria-hidden="true" />
                {t('sos.callAmbulanceShort', { number: ambulance })}
              </a>
            </div>
          </div>
        )}

        {hospitals.length > 0 && position && (
          <>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <HospitalMap center={position} hospitals={hospitals} />
            </div>

            <ul className="mt-4 divide-y divide-slate-100">
              {hospitals.slice(0, 10).map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{h.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatDistance(h.distance)}
                      {h.address && ` · ${h.address}`}
                      {h.emergency && ` · ${t('sos.hasEmergency')}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {h.phone && (
                      <a href={`tel:${h.phone}`} className="btn-secondary py-1.5 text-xs">
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('sos.call')}
                      </a>
                    )}
                    <a
                      href={`https://www.openstreetmap.org/directions?from=${position.latitude},${position.longitude}&to=${h.lat},${h.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary py-1.5 text-xs"
                    >
                      <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('sos.directions')}
                    </a>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-3 text-xs text-slate-400">{t('sos.osmAttribution')}</p>
          </>
        )}
      </section>
    </>
  );
}
