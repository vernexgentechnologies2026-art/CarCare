import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '@/components/ui';
import { qk } from '@/hooks/queryKeys';
import { useServices } from '@/services';
import { MasterCalendar } from './MasterCalendar';
import { RescheduleQueue } from './RescheduleQueue';

/** Schedule & reschedule queue: master calendar of daily jobs + pending request review. */
export function SchedulesPage() {
  const services = useServices();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'calendar' ? 'calendar' : 'queue';
  const today = services.today();
  const stats = useQuery({ queryKey: qk.admin.dashboard(today), queryFn: () => services.admin.getDashboard(today) });

  return (
    <div>
      <PageHeader title="Schedules" description="Daily job calendar and missed-wash reschedule requests." />
      <Tabs
        label="Schedules view"
        className="mb-5"
        value={tab}
        onChange={(v) => setParams(v === 'calendar' ? { tab: 'calendar' } : {}, { replace: true })}
        options={[
          { value: 'queue', label: 'Reschedule queue', count: stats.data?.openReschedules },
          { value: 'calendar', label: 'Master calendar' },
        ]}
      />
      {tab === 'calendar' ? <MasterCalendar /> : <RescheduleQueue />}
    </div>
  );
}
