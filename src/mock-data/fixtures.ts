/** Static fictional reference data used by the seed generator. No real people or prices. */
import type { CarSize, SchedulePattern } from '@/types';

export const SOCIETY_ADDRESS = 'Greenfield Heights, Old Mahabalipuram Road, Chennai 600097';

/** Package catalogue: each schedule is offered to small cars and to SUVs. Prices are placeholders. */
export const PACKAGE_CATALOGUE: ReadonlyArray<{
  id: string;
  name: string;
  schedulePattern: SchedulePattern;
  carSizes: CarSize[];
  monthlyPrice: number;
  features: string[];
}> = [
  { id: 'pkg_daily_small', name: 'Everyday Shine — Hatch & Sedan', schedulePattern: 'DAILY', carSizes: ['HATCHBACK', 'SEDAN'], monthlyPrice: 1499, features: ['Exterior foam wash every day', 'Tyre & rim cleaning', 'Weekly interior dust wipe', 'After-wash photo every visit'] },
  { id: 'pkg_daily_suv', name: 'Everyday Shine — SUV', schedulePattern: 'DAILY', carSizes: ['COMPACT_SUV', 'LARGE_SUV'], monthlyPrice: 1999, features: ['Exterior foam wash every day', 'Tyre & rim cleaning', 'Weekly interior dust wipe', 'Roof & running-board care', 'After-wash photo every visit'] },
  { id: 'pkg_mwf_small', name: 'Alternate Day Care — Hatch & Sedan', schedulePattern: 'MON_WED_FRI', carSizes: ['HATCHBACK', 'SEDAN'], monthlyPrice: 999, features: ['Exterior wash Mon · Wed · Fri', 'Tyre & rim cleaning', 'After-wash photo every visit'] },
  { id: 'pkg_mwf_suv', name: 'Alternate Day Care — SUV', schedulePattern: 'MON_WED_FRI', carSizes: ['COMPACT_SUV', 'LARGE_SUV'], monthlyPrice: 1299, features: ['Exterior wash Mon · Wed · Fri', 'Tyre & rim cleaning', 'Roof & running-board care', 'After-wash photo every visit'] },
  { id: 'pkg_tf_small', name: 'Twice Weekly — Hatch & Sedan', schedulePattern: 'TUE_FRI', carSizes: ['HATCHBACK', 'SEDAN'], monthlyPrice: 799, features: ['Exterior wash Tue · Fri', 'Tyre cleaning', 'After-wash photo every visit'] },
  { id: 'pkg_tf_suv', name: 'Twice Weekly — SUV', schedulePattern: 'TUE_FRI', carSizes: ['COMPACT_SUV', 'LARGE_SUV'], monthlyPrice: 999, features: ['Exterior wash Tue · Fri', 'Tyre cleaning', 'After-wash photo every visit'] },
  { id: 'pkg_thu_small', name: 'Weekly Refresh — Hatch & Sedan', schedulePattern: 'THU_ONLY', carSizes: ['HATCHBACK', 'SEDAN'], monthlyPrice: 499, features: ['Exterior wash every Thursday', 'After-wash photo every visit'] },
  { id: 'pkg_thu_suv', name: 'Weekly Refresh — SUV', schedulePattern: 'THU_ONLY', carSizes: ['COMPACT_SUV', 'LARGE_SUV'], monthlyPrice: 649, features: ['Exterior wash every Thursday', 'After-wash photo every visit'] },
];

export const MODELS: ReadonlyArray<[string, CarSize]> = [
  ['Maruti Suzuki Swift', 'HATCHBACK'],
  ['Hyundai i20', 'HATCHBACK'],
  ['Tata Tiago', 'HATCHBACK'],
  ['Maruti Suzuki Baleno', 'HATCHBACK'],
  ['Honda City', 'SEDAN'],
  ['Hyundai Verna', 'SEDAN'],
  ['Skoda Slavia', 'SEDAN'],
  ['Maruti Suzuki Dzire', 'SEDAN'],
  ['Tata Nexon', 'COMPACT_SUV'],
  ['Maruti Suzuki Brezza', 'COMPACT_SUV'],
  ['Hyundai Venue', 'COMPACT_SUV'],
  ['Kia Sonet', 'COMPACT_SUV'],
  ['Hyundai Creta', 'LARGE_SUV'],
  ['Mahindra XUV700', 'LARGE_SUV'],
  ['Toyota Innova Crysta', 'LARGE_SUV'],
  ['Mahindra Scorpio-N', 'LARGE_SUV'],
];

export const COLORS = ['Pearl White', 'Silver', 'Grey', 'Black', 'Red', 'Blue', 'Brown', 'White'];

export const FIRST = [
  'Arun', 'Priya', 'Karthik', 'Divya', 'Suresh', 'Lakshmi', 'Vignesh', 'Meena', 'Rahul', 'Ananya',
  'Ganesh', 'Kavya', 'Sanjay', 'Deepa', 'Pradeep', 'Revathi', 'Harish', 'Nandini', 'Vikram', 'Shalini',
  'Ramesh', 'Sowmya', 'Ajay', 'Keerthi', 'Manoj', 'Pooja', 'Naveen', 'Swathi', 'Rajesh', 'Aishwarya',
  'Balaji', 'Gayathri', 'Sathish', 'Bhavana', 'Mohan', 'Janani', 'Anand', 'Sneha', 'Venkat', 'Harini',
];

export const LAST = [
  'Kumar', 'Raman', 'Iyer', 'Krishnan', 'Subramanian', 'Reddy', 'Nair', 'Rao', 'Sharma', 'Menon',
  'Srinivasan', 'Natarajan', 'Pillai', 'Venkatesh', 'Gopal', 'Bhat', 'Shetty', 'Chandran', 'Mehta', 'Das',
];

export const CLEANER_NAMES = [
  'Murugan S', 'Selvam R', 'Ravi K', 'Mani P', 'Senthil V', 'Kannan M', 'Prakash D', 'Arumugam T',
  'Dinesh B', 'Saravanan G', 'Velu A', 'Raja C', 'Babu N', 'Siva L', 'Kumar J', 'Elango R',
  'Gopi S', 'Muthu K', 'Anbu P', 'Vijay M', 'Bala T', 'Durai V', 'Karthi E', 'Pandi R',
];

export const RTO = ['TN-09', 'TN-10', 'TN-07', 'TN-22', 'TN-14', 'TN-11', 'KA-01', 'KA-05', 'KA-51'];
export const SERIES_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

export const TIME_RESTRICTIONS = [
  'Leaves by 7:30 AM — wash before 7:00 AM',
  'Available only after 10:00 AM',
  'Car key with security desk',
  'Leaves by 8:00 AM on weekdays',
];

export const INSTRUCTIONS = [
  'Please fold the mirrors back after washing.',
  'Avoid spraying near the sunroof seals.',
  'Dashboard camera on the windscreen — wipe gently.',
  'Rear wiper is loose; please don’t lift it.',
];

export const NOT_PRESENT_NOTES = ['Car not in slot', 'Owner out of town', 'Slot empty at 6:30 AM', 'Car parked outside'];
