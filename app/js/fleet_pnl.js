/* ==========================================================================
   ISABI Systems - Truck Fleet Revenue & Cost Analysis Module
   Complete Bdeir Fleet Audit (TB1, Tb7, Tb9: Aug 24 - Oct 23, 2026)
   + Live Dynamic Fleet P&L Engine from SEED.records
   ========================================================================== */
(function () {
  'use strict';

  const CUTOVER_DATA = {"sales_sites":[{"truck":"TB1","co":"BBConstruction","customer":"Sabeh Beton","site":"Choueifat","product":"Jarousha","trips":33,"paid_trips":0,"zero_trips":33,"qty":957,"unit_prices":[19.5,22],"mat_rev":20329,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-26","max_date":"2026-10-23","status":"Zero Haulage ($0 Billed)","est_missing":3828,"note":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) TransAdj split on BBConstruction.","site_label":"Sabeh Beton (Choueifat)","vol":957,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-10-23","status_full":"Zero Haulage ($0 Billed): Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) TransAdj split on BBConstruction."},{"truck":"TB1","co":"WTC","customer":"majed terro","site":"sibline","product":"Mghasal","trips":21,"paid_trips":21,"zero_trips":0,"qty":609,"unit_prices":[22.5],"mat_rev":13702.5,"trans_units":[3.5],"trans_rev":2131.5,"per_trip":101.5,"ot_trips":19,"ot_amt":184,"drivers":"Majed Karam","min_date":"2026-08-31","max_date":"2026-09-25","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($101.50/trip at $3.5/m³).","site_label":"majed terro (sibline)","vol":609,"ot_allow":184,"first_dt":"2026-08-31","last_dt":"2026-09-25","status_full":"Strong Rate ($95+/trip): High-yield long haul ($101.50/trip at $3.5/m³)."},{"truck":"TB1","co":"WTC","customer":"mega beton","site":"choueifat","product":"Mghasal","trips":19,"paid_trips":19,"zero_trips":0,"qty":551,"unit_prices":[22.5],"mat_rev":12397.5,"trans_units":[2.5],"trans_rev":1377.5,"per_trip":72.5,"ot_trips":9,"ot_amt":49,"drivers":"Majed Karam (15), Ahmad Hamoud (4)","min_date":"2026-08-27","max_date":"2026-10-11","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($72.50/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":551,"ot_allow":49,"first_dt":"2026-08-27","last_dt":"2026-10-11","status_full":"Adequate: Standard urban delivery rate ($72.50/trip at $2.5/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"majbal Al Afaq","site":"beirut","product":"ba7es","trips":7,"paid_trips":7,"zero_trips":0,"qty":273.78,"unit_prices":[10],"mat_rev":2737.8,"trans_units":[4],"trans_rev":812,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-24","max_date":"2026-10-22","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $4.0/m³).","site_label":"majbal Al Afaq (beirut)","vol":273.78,"ot_allow":0,"first_dt":"2026-09-24","last_dt":"2026-10-22","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $4.0/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"Sabeh Beton","site":"Choueifat","product":"sarek","trips":6,"paid_trips":0,"zero_trips":6,"qty":228.18,"unit_prices":[19],"mat_rev":3306,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-23","max_date":"2026-10-17","status":"Zero Haulage ($0 Billed)","est_missing":912.72,"note":"Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$152/trip) TransAdj split on BBConstruction.","site_label":"Sabeh Beton (Choueifat)","vol":228.18,"ot_allow":0,"first_dt":"2026-09-23","last_dt":"2026-10-17","status_full":"Zero Haulage ($0 Billed): Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$152/trip) TransAdj split on BBConstruction."},{"truck":"TB1","co":"BBConstruction","customer":"mohamad saab","site":"beirut","product":"Jarousha","trips":3,"paid_trips":3,"zero_trips":0,"qty":87,"unit_prices":[11],"mat_rev":1492.81,"trans_units":[116],"trans_rev":348,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-26","max_date":"2026-09-09","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $116.0/m³).","site_label":"mohamad saab (beirut)","vol":87,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-09-09","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $116.0/m³)."},{"truck":"TB1","co":"WTC","customer":"Sabeh Beton S.R.L","site":"Gisr al bacha","product":"Mghasal","trips":3,"paid_trips":3,"zero_trips":0,"qty":87,"unit_prices":[23.5],"mat_rev":2044.5,"trans_units":[2],"trans_rev":174,"per_trip":58,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-24","max_date":"2026-08-25","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"Sabeh Beton S.R.L (Gisr al bacha)","vol":87,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-08-25","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"majbal Al Afaq","site":"beirut","product":"sarek","trips":2,"paid_trips":2,"zero_trips":0,"qty":77.87,"unit_prices":[10.5],"mat_rev":817.63,"trans_units":[4],"trans_rev":232,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-10-09","max_date":"2026-10-12","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $4.0/m³).","site_label":"majbal Al Afaq (beirut)","vol":77.87,"ot_allow":0,"first_dt":"2026-10-09","last_dt":"2026-10-12","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $4.0/m³)."},{"truck":"TB1","co":"WTC","customer":"mega beton","site":"choueifat","product":"Ramel","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"unit_prices":[22],"mat_rev":1276,"trans_units":[2.5],"trans_rev":145,"per_trip":72.5,"ot_trips":2,"ot_amt":10,"drivers":"Majed Karam","min_date":"2026-09-10","max_date":"2026-09-10","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($72.50/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":58,"ot_allow":10,"first_dt":"2026-09-10","last_dt":"2026-09-10","status_full":"Adequate: Standard urban delivery rate ($72.50/trip at $2.5/m³)."},{"truck":"TB1","co":"WTC","customer":"haj ibrahim","site":"afak","product":"Mghasal","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"unit_prices":[23],"mat_rev":1334,"trans_units":[2],"trans_rev":116,"per_trip":58,"ot_trips":0,"ot_amt":0,"drivers":"Ahmad Hamoud","min_date":"2026-10-11","max_date":"2026-10-21","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"haj ibrahim (afak)","vol":58,"ot_allow":0,"first_dt":"2026-10-11","last_dt":"2026-10-21","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"Majbal Al Afaq","site":"beirut","product":"sarek","trips":1,"paid_trips":1,"zero_trips":0,"qty":39.85,"unit_prices":[10],"mat_rev":398.5,"trans_units":[4],"trans_rev":116,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-21","max_date":"2026-09-21","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $4.0/m³).","site_label":"Majbal Al Afaq (beirut)","vol":39.85,"ot_allow":0,"first_dt":"2026-09-21","last_dt":"2026-09-21","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $4.0/m³)."},{"truck":"TB1","co":"WTC","customer":"Haj Ibrahim","site":"afak","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[23],"mat_rev":638,"trans_units":[3],"trans_rev":87,"per_trip":87,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-10","max_date":"2026-09-10","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($87.00/trip at $3.0/m³).","site_label":"Haj Ibrahim (afak)","vol":29,"ot_allow":0,"first_dt":"2026-09-10","last_dt":"2026-09-10","status_full":"Adequate: Standard urban delivery rate ($87.00/trip at $3.0/m³)."},{"truck":"TB1","co":"WTC","customer":"Haj Ibrahim","site":"afak","product":"Ramel","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[20],"mat_rev":580,"trans_units":[3],"trans_rev":87,"per_trip":87,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-12","max_date":"2026-09-12","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($87.00/trip at $3.0/m³).","site_label":"Haj Ibrahim (afak)","vol":29,"ot_allow":0,"first_dt":"2026-09-12","last_dt":"2026-09-12","status_full":"Adequate: Standard urban delivery rate ($87.00/trip at $3.0/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"ARACO - Jiyeh","site":"beirut","product":"Bodra","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[9],"mat_rev":426.69,"trans_units":[3],"trans_rev":87,"per_trip":87,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-29","max_date":"2026-08-29","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($87.00/trip at $3.0/m³).","site_label":"ARACO - Jiyeh (beirut)","vol":29,"ot_allow":0,"first_dt":"2026-08-29","last_dt":"2026-08-29","status_full":"Adequate: Standard urban delivery rate ($87.00/trip at $3.0/m³)."},{"truck":"TB1","co":"WTC","customer":"sabeh beton s.r.l","site":"Gisr al bacha","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[23.5],"mat_rev":681.5,"trans_units":[2],"trans_rev":58,"per_trip":58,"ot_trips":1,"ot_amt":5,"drivers":"Ahmad Hamoud","min_date":"2026-10-17","max_date":"2026-10-17","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"sabeh beton s.r.l (Gisr al bacha)","vol":29,"ot_allow":5,"first_dt":"2026-10-17","last_dt":"2026-10-17","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"TB1","co":"WTC","customer":"SOIME choueifat","site":"choueifat","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[14],"mat_rev":678.37,"trans_units":[1.15],"trans_rev":55.72,"per_trip":55.72,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-16","max_date":"2026-09-16","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($55.72/trip at $1.15/m³).","site_label":"SOIME choueifat (choueifat)","vol":29,"ot_allow":0,"first_dt":"2026-09-16","last_dt":"2026-09-16","status_full":"Adequate: Standard urban delivery rate ($55.72/trip at $1.15/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"Sabeh Beton","site":"Nahr El-Mot","product":"Jarousha","trips":1,"paid_trips":0,"zero_trips":1,"qty":29,"unit_prices":[23],"mat_rev":667,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-15","max_date":"2026-09-15","status":"Zero Haulage ($0 Billed)","est_missing":116,"note":"Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) TransAdj split on BBConstruction.","site_label":"Sabeh Beton (Nahr El-Mot)","vol":29,"ot_allow":0,"first_dt":"2026-09-15","last_dt":"2026-09-15","status_full":"Zero Haulage ($0 Billed): Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) TransAdj split on BBConstruction."},{"truck":"Tb7","co":"BBConstruction","customer":"Sabeh Beton","site":"Choueifat","product":"Jarousha","trips":45,"paid_trips":0,"zero_trips":45,"qty":1285,"unit_prices":[19.5,22],"mat_rev":27430,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-26","max_date":"2026-10-20","status":"Zero Haulage ($0 Billed)","est_missing":5140,"note":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$114/trip) TransAdj split on BBConstruction.","site_label":"Sabeh Beton (Choueifat)","vol":1285,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-10-20","status_full":"Zero Haulage ($0 Billed): Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$114/trip) TransAdj split on BBConstruction."},{"truck":"Tb7","co":"WTC","customer":"mega beton","site":"choueifat","product":"Mghasal","trips":25,"paid_trips":25,"zero_trips":0,"qty":703,"unit_prices":[22.5],"mat_rev":15817.5,"trans_units":[2.5],"trans_rev":1757.5,"per_trip":70.3,"ot_trips":11,"ot_amt":63,"drivers":"Mohamad Habib","min_date":"2026-08-24","max_date":"2026-10-10","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($70.30/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":703,"ot_allow":63,"first_dt":"2026-08-24","last_dt":"2026-10-10","status_full":"Adequate: Standard urban delivery rate ($70.30/trip at $2.5/m³)."},{"truck":"Tb7","co":"WTC","customer":"majed terro","site":"sibline","product":"Mghasal","trips":21,"paid_trips":21,"zero_trips":0,"qty":589,"unit_prices":[22.5],"mat_rev":13252.5,"trans_units":[3.5],"trans_rev":2061.5,"per_trip":98.17,"ot_trips":17,"ot_amt":164,"drivers":"Mohamad Habib","min_date":"2026-08-31","max_date":"2026-10-05","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($98.17/trip at $3.5/m³).","site_label":"majed terro (sibline)","vol":589,"ot_allow":164,"first_dt":"2026-08-31","last_dt":"2026-10-05","status_full":"Strong Rate ($95+/trip): High-yield long haul ($98.17/trip at $3.5/m³)."},{"truck":"Tb7","co":"BBConstruction","customer":"majbal Al Afaq","site":"beirut","product":"ba7es","trips":7,"paid_trips":7,"zero_trips":0,"qty":268.43,"unit_prices":[10],"mat_rev":2684.3,"trans_units":[4],"trans_rev":812,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-24","max_date":"2026-10-20","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $4.0/m³).","site_label":"majbal Al Afaq (beirut)","vol":268.43,"ot_allow":0,"first_dt":"2026-09-24","last_dt":"2026-10-20","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $4.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"mega beton","site":"choueifat","product":"Ramel","trips":6,"paid_trips":6,"zero_trips":0,"qty":168,"unit_prices":[22],"mat_rev":3696,"trans_units":[2.5],"trans_rev":420,"per_trip":70,"ot_trips":3,"ot_amt":15,"drivers":"Mohamad Habib","min_date":"2026-09-10","max_date":"2026-09-16","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($70.00/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":168,"ot_allow":15,"first_dt":"2026-09-10","last_dt":"2026-09-16","status_full":"Adequate: Standard urban delivery rate ($70.00/trip at $2.5/m³)."},{"truck":"Tb7","co":"WTC","customer":"sabeh beton s.r.l","site":"Gisr al bacha","product":"Mghasal","trips":4,"paid_trips":4,"zero_trips":0,"qty":116,"unit_prices":[23.5],"mat_rev":2726,"trans_units":[2],"trans_rev":232,"per_trip":58,"ot_trips":1,"ot_amt":5,"drivers":"Mohamad Habib","min_date":"2026-10-05","max_date":"2026-10-17","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"sabeh beton s.r.l (Gisr al bacha)","vol":116,"ot_allow":5,"first_dt":"2026-10-05","last_dt":"2026-10-17","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"sabeh beton s.r.l","site":"choueifat","product":"Mghasal","trips":4,"paid_trips":4,"zero_trips":0,"qty":116,"unit_prices":[23.5],"mat_rev":2726,"trans_units":[2],"trans_rev":232,"per_trip":58,"ot_trips":2,"ot_amt":14,"drivers":"Mohamad Habib","min_date":"2026-10-09","max_date":"2026-10-17","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"sabeh beton s.r.l (choueifat)","vol":116,"ot_allow":14,"first_dt":"2026-10-09","last_dt":"2026-10-17","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"sabeh beton s.r.l","site":"choueifat","product":"Kasara","trips":4,"paid_trips":4,"zero_trips":0,"qty":116,"unit_prices":[23.5],"mat_rev":2726,"trans_units":[2],"trans_rev":232,"per_trip":58,"ot_trips":3,"ot_amt":21,"drivers":"Mohamad Habib","min_date":"2026-10-12","max_date":"2026-10-14","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"sabeh beton s.r.l (choueifat)","vol":116,"ot_allow":21,"first_dt":"2026-10-12","last_dt":"2026-10-14","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"Tb7","co":"BBConstruction","customer":"Sabeh Beton","site":"Choueifat","product":"sarek","trips":4,"paid_trips":0,"zero_trips":4,"qty":149.88,"unit_prices":[19],"mat_rev":2204,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-24","max_date":"2026-10-17","status":"Zero Haulage ($0 Billed)","est_missing":599.52,"note":"Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$150/trip) TransAdj split on BBConstruction.","site_label":"Sabeh Beton (Choueifat)","vol":149.88,"ot_allow":0,"first_dt":"2026-09-24","last_dt":"2026-10-17","status_full":"Zero Haulage ($0 Billed): Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$150/trip) TransAdj split on BBConstruction."},{"truck":"Tb7","co":"WTC","customer":"SOIME choueifat","site":"choueifat","product":"Mghasal","trips":3,"paid_trips":3,"zero_trips":0,"qty":84,"unit_prices":[14],"mat_rev":1983.45,"trans_units":[1.15],"trans_rev":162.93,"per_trip":54.31,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-24","max_date":"2026-09-03","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.31/trip ($1.15/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"SOIME choueifat (choueifat)","vol":84,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-09-03","status_full":"Low Rate (<$55/trip): Earns $54.31/trip ($1.15/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb7","co":"BBConstruction","customer":"majbal Al Afaq","site":"beirut","product":"sarek","trips":2,"paid_trips":2,"zero_trips":0,"qty":75.25,"unit_prices":[10,10.5],"mat_rev":771.36,"trans_units":[4],"trans_rev":228,"per_trip":114,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-22","max_date":"2026-10-12","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($114.00/trip at $4.0/m³).","site_label":"majbal Al Afaq (beirut)","vol":75.25,"ot_allow":0,"first_dt":"2026-09-22","last_dt":"2026-10-12","status_full":"Strong Rate ($95+/trip): High-yield long haul ($114.00/trip at $4.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"soime dawra","site":"dawra","product":"Mghasal","trips":2,"paid_trips":2,"zero_trips":0,"qty":56,"unit_prices":[14],"mat_rev":1351.77,"trans_units":[1.75],"trans_rev":168.97,"per_trip":84.48,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-24","max_date":"2026-09-11","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($84.48/trip at $1.75/m³).","site_label":"soime dawra (dawra)","vol":56,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-09-11","status_full":"Adequate: Standard urban delivery rate ($84.48/trip at $1.75/m³)."},{"truck":"Tb7","co":"WTC","customer":"haj ibrahim","site":"afak","product":"Mghasal","trips":2,"paid_trips":2,"zero_trips":0,"qty":56,"unit_prices":[23],"mat_rev":1288,"trans_units":[2],"trans_rev":112,"per_trip":56,"ot_trips":2,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-26","max_date":"2026-09-26","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($56.00/trip at $2.0/m³).","site_label":"haj ibrahim (afak)","vol":56,"ot_allow":0,"first_dt":"2026-09-26","last_dt":"2026-09-26","status_full":"Adequate: Standard urban delivery rate ($56.00/trip at $2.0/m³)."},{"truck":"Tb7","co":"BBConstruction","customer":"Sabeh Beton","site":"Nahr El-Mot","product":"Jarousha","trips":2,"paid_trips":0,"zero_trips":2,"qty":56,"unit_prices":[23],"mat_rev":1288,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-14","max_date":"2026-09-15","status":"Zero Haulage ($0 Billed)","est_missing":224,"note":"Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$112/trip) TransAdj split on BBConstruction.","site_label":"Sabeh Beton (Nahr El-Mot)","vol":56,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-15","status_full":"Zero Haulage ($0 Billed): Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$112/trip) TransAdj split on BBConstruction."},{"truck":"Tb7","co":"BBConstruction","customer":"ARACO - Jiyeh","site":"Choueifat","product":"sarek","trips":1,"paid_trips":1,"zero_trips":0,"qty":37.6,"unit_prices":[10.5],"mat_rev":394.8,"trans_units":[4],"trans_rev":116,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-10-07","max_date":"2026-10-07","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $4.0/m³).","site_label":"ARACO - Jiyeh (Choueifat)","vol":37.6,"ot_allow":0,"first_dt":"2026-10-07","last_dt":"2026-10-07","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $4.0/m³)."},{"truck":"Tb7","co":"BBConstruction","customer":"Embassy of Kuwait","site":"beirut","product":"Bodra","trips":1,"paid_trips":1,"zero_trips":0,"qty":47.16,"unit_prices":[9.5],"mat_rev":448,"trans_units":[0],"trans_rev":108,"per_trip":108,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-10-10","max_date":"2026-10-10","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($108.00/trip at $0.0/m³).","site_label":"Embassy of Kuwait (beirut)","vol":47.16,"ot_allow":0,"first_dt":"2026-10-10","last_dt":"2026-10-10","status_full":"Strong Rate ($95+/trip): High-yield long haul ($108.00/trip at $0.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"Haj Ibrahim","site":"afak","product":"Ramel","trips":1,"paid_trips":1,"zero_trips":0,"qty":28,"unit_prices":[20],"mat_rev":560,"trans_units":[3],"trans_rev":84,"per_trip":84,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-16","max_date":"2026-09-16","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($84.00/trip at $3.0/m³).","site_label":"Haj Ibrahim (afak)","vol":28,"ot_allow":0,"first_dt":"2026-09-16","last_dt":"2026-09-16","status_full":"Adequate: Standard urban delivery rate ($84.00/trip at $3.0/m³)."},{"truck":"Tb7","co":"BBConstruction","customer":"ARACO - Jiyeh","site":"beirut","product":"Bodra","trips":1,"paid_trips":1,"zero_trips":0,"qty":28,"unit_prices":[9],"mat_rev":412.47,"trans_units":[3],"trans_rev":84,"per_trip":84,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-29","max_date":"2026-08-29","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($84.00/trip at $3.0/m³).","site_label":"ARACO - Jiyeh (beirut)","vol":28,"ot_allow":0,"first_dt":"2026-08-29","last_dt":"2026-08-29","status_full":"Adequate: Standard urban delivery rate ($84.00/trip at $3.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"soime choueifat","site":"choueifat","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[14.5],"mat_rev":713.62,"trans_units":[1.25],"trans_rev":61.52,"per_trip":61.52,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-10-21","max_date":"2026-10-21","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($61.52/trip at $1.25/m³).","site_label":"soime choueifat (choueifat)","vol":29,"ot_allow":0,"first_dt":"2026-10-21","last_dt":"2026-10-21","status_full":"Adequate: Standard urban delivery rate ($61.52/trip at $1.25/m³)."},{"truck":"Tb7","co":"WTC","customer":"majbal rayan","site":"choueifat","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":28,"unit_prices":[24],"mat_rev":672,"trans_units":[2],"trans_rev":56,"per_trip":56,"ot_trips":1,"ot_amt":5,"drivers":"Mohamad Habib","min_date":"2026-09-13","max_date":"2026-09-13","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($56.00/trip at $2.0/m³).","site_label":"majbal rayan (choueifat)","vol":28,"ot_allow":5,"first_dt":"2026-09-13","last_dt":"2026-09-13","status_full":"Adequate: Standard urban delivery rate ($56.00/trip at $2.0/m³)."},{"truck":"Tb9","co":"WTC","customer":"mega beton","site":"choueifat","product":"Mghasal","trips":49,"paid_trips":49,"zero_trips":0,"qty":1323,"unit_prices":[22.5],"mat_rev":29767.5,"trans_units":[2.5],"trans_rev":3307.5,"per_trip":67.5,"ot_trips":19,"ot_amt":119,"drivers":"Ali Saleh","min_date":"2026-08-24","max_date":"2026-10-17","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($67.50/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":1323,"ot_allow":119,"first_dt":"2026-08-24","last_dt":"2026-10-17","status_full":"Adequate: Standard urban delivery rate ($67.50/trip at $2.5/m³)."},{"truck":"Tb9","co":"WTC","customer":"soime choueifat","site":"choueifat","product":"Mghasal","trips":22,"paid_trips":22,"zero_trips":0,"qty":594,"unit_prices":[14,14.5],"mat_rev":14683.18,"trans_units":[1.15,1.25],"trans_rev":1257.85,"per_trip":57.17,"ot_trips":1,"ot_amt":7,"drivers":"Ali Saleh","min_date":"2026-09-10","max_date":"2026-10-22","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($57.17/trip at $1.15/m³).","site_label":"soime choueifat (choueifat)","vol":594,"ot_allow":7,"first_dt":"2026-09-10","last_dt":"2026-10-22","status_full":"Adequate: Standard urban delivery rate ($57.17/trip at $1.15/m³)."},{"truck":"Tb9","co":"WTC","customer":"sabeh beton s.r.l","site":"Gisr al bacha","product":"Mghasal","trips":8,"paid_trips":8,"zero_trips":0,"qty":216,"unit_prices":[23.5],"mat_rev":5076,"trans_units":[2],"trans_rev":432,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-06","max_date":"2026-10-22","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"sabeh beton s.r.l (Gisr al bacha)","vol":216,"ot_allow":0,"first_dt":"2026-10-06","last_dt":"2026-10-22","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"mega beton","site":"choueifat","product":"Kasara","trips":6,"paid_trips":6,"zero_trips":0,"qty":162,"unit_prices":[22.5,23],"mat_rev":3658.5,"trans_units":[2.5],"trans_rev":405,"per_trip":67.5,"ot_trips":3,"ot_amt":21,"drivers":"Ali Saleh","min_date":"2026-09-22","max_date":"2026-10-22","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($67.50/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":162,"ot_allow":21,"first_dt":"2026-09-22","last_dt":"2026-10-22","status_full":"Adequate: Standard urban delivery rate ($67.50/trip at $2.5/m³)."},{"truck":"Tb9","co":"WTC","customer":"SOIME choueifat","site":"choueifat","product":"Mghasal","trips":6,"paid_trips":6,"zero_trips":0,"qty":162,"unit_prices":[14],"mat_rev":3864,"trans_units":[1.15],"trans_rev":317.4,"per_trip":52.9,"ot_trips":1,"ot_amt":5,"drivers":"Ali Saleh","min_date":"2026-08-28","max_date":"2026-09-16","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $52.90/trip ($1.15/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"SOIME choueifat (choueifat)","vol":162,"ot_allow":5,"first_dt":"2026-08-28","last_dt":"2026-09-16","status_full":"Low Rate (<$55/trip): Earns $52.90/trip ($1.15/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"BBConstruction","customer":"Sabeh Beton","site":"Choueifat","product":"Jarousha","trips":5,"paid_trips":0,"zero_trips":5,"qty":135,"unit_prices":[19.5,22],"mat_rev":2835,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-28","max_date":"2026-10-13","status":"Zero Haulage ($0 Billed)","est_missing":540,"note":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$108/trip) TransAdj split on BBConstruction.","site_label":"Sabeh Beton (Choueifat)","vol":135,"ot_allow":0,"first_dt":"2026-08-28","last_dt":"2026-10-13","status_full":"Zero Haulage ($0 Billed): Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$108/trip) TransAdj split on BBConstruction."},{"truck":"Tb9","co":"BBConstruction","customer":"majbal Al Afaq","site":"beirut","product":"ba7es","trips":4,"paid_trips":4,"zero_trips":0,"qty":151.18,"unit_prices":[10],"mat_rev":1511.8,"trans_units":[4],"trans_rev":432,"per_trip":108,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-24","max_date":"2026-10-22","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($108.00/trip at $4.0/m³).","site_label":"majbal Al Afaq (beirut)","vol":151.18,"ot_allow":0,"first_dt":"2026-09-24","last_dt":"2026-10-22","status_full":"Strong Rate ($95+/trip): High-yield long haul ($108.00/trip at $4.0/m³)."},{"truck":"Tb9","co":"WTC","customer":"soime dawra","site":"dawra","product":"Mghasal","trips":4,"paid_trips":4,"zero_trips":0,"qty":108,"unit_prices":[14,14.5],"mat_rev":2609.6,"trans_units":[1.75,1.9],"trans_rev":334.19,"per_trip":83.55,"ot_trips":2,"ot_amt":10,"drivers":"Ali Saleh","min_date":"2026-09-03","max_date":"2026-09-25","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($83.55/trip at $1.75/m³).","site_label":"soime dawra (dawra)","vol":108,"ot_allow":10,"first_dt":"2026-09-03","last_dt":"2026-09-25","status_full":"Adequate: Standard urban delivery rate ($83.55/trip at $1.75/m³)."},{"truck":"Tb9","co":"WTC","customer":"Haj Ibrahim","site":"afak","product":"Ramel","trips":4,"paid_trips":4,"zero_trips":0,"qty":108,"unit_prices":[20],"mat_rev":2160,"trans_units":[3],"trans_rev":324,"per_trip":81,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-12","max_date":"2026-09-15","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($81.00/trip at $3.0/m³).","site_label":"Haj Ibrahim (afak)","vol":108,"ot_allow":0,"first_dt":"2026-09-12","last_dt":"2026-09-15","status_full":"Adequate: Standard urban delivery rate ($81.00/trip at $3.0/m³)."},{"truck":"Tb9","co":"WTC","customer":"safara","site":"choueifat","product":"Mghasal","trips":4,"paid_trips":4,"zero_trips":0,"qty":108,"unit_prices":[23,24],"mat_rev":2538,"trans_units":[2],"trans_rev":216,"per_trip":54,"ot_trips":1,"ot_amt":5,"drivers":"Ali Saleh","min_date":"2026-08-29","max_date":"2026-10-09","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"safara (choueifat)","vol":108,"ot_allow":5,"first_dt":"2026-08-29","last_dt":"2026-10-09","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"sabeh beton s.r.l","site":"Gisr al bacha","product":"Kasara","trips":4,"paid_trips":4,"zero_trips":0,"qty":108,"unit_prices":[23.5],"mat_rev":2538,"trans_units":[2],"trans_rev":216,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-13","max_date":"2026-10-16","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"sabeh beton s.r.l (Gisr al bacha)","vol":108,"ot_allow":0,"first_dt":"2026-10-13","last_dt":"2026-10-16","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"majbal rayan","site":"choueifat","product":"Mghasal","trips":3,"paid_trips":3,"zero_trips":0,"qty":81,"unit_prices":[24],"mat_rev":1944,"trans_units":[2],"trans_rev":162,"per_trip":54,"ot_trips":1,"ot_amt":7,"drivers":"Ali Saleh","min_date":"2026-09-17","max_date":"2026-09-23","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"majbal rayan (choueifat)","vol":81,"ot_allow":7,"first_dt":"2026-09-17","last_dt":"2026-09-23","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"sabeh beton s.r.l","site":"choueifat","product":"Mghasal","trips":3,"paid_trips":3,"zero_trips":0,"qty":81,"unit_prices":[23.5],"mat_rev":1903.5,"trans_units":[2],"trans_rev":162,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-09","max_date":"2026-10-19","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"sabeh beton s.r.l (choueifat)","vol":81,"ot_allow":0,"first_dt":"2026-10-09","last_dt":"2026-10-19","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"haj ali","site":"hazmeih","product":"soil","trips":2,"paid_trips":2,"zero_trips":0,"qty":54,"unit_prices":[6],"mat_rev":340,"trans_units":[100],"trans_rev":200,"per_trip":100,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-04","max_date":"2026-09-07","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($100.00/trip at $100.0/m³).","site_label":"haj ali (hazmeih)","vol":54,"ot_allow":0,"first_dt":"2026-09-04","last_dt":"2026-09-07","status_full":"Strong Rate ($95+/trip): High-yield long haul ($100.00/trip at $100.0/m³)."},{"truck":"Tb9","co":"WTC","customer":"mega beton","site":"choueifat","product":"Ramel","trips":2,"paid_trips":2,"zero_trips":0,"qty":54,"unit_prices":[22],"mat_rev":1188,"trans_units":[2.5],"trans_rev":135,"per_trip":67.5,"ot_trips":2,"ot_amt":10,"drivers":"Ali Saleh","min_date":"2026-09-10","max_date":"2026-09-11","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($67.50/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":54,"ot_allow":10,"first_dt":"2026-09-10","last_dt":"2026-09-11","status_full":"Adequate: Standard urban delivery rate ($67.50/trip at $2.5/m³)."},{"truck":"Tb9","co":"WTC","customer":"william nasar","site":"Burj Al Barajneh","product":"Mghasal","trips":2,"paid_trips":2,"zero_trips":0,"qty":54,"unit_prices":[22],"mat_rev":1192,"trans_units":[2],"trans_rev":108,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-24","max_date":"2026-09-01","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"william nasar (Burj Al Barajneh)","vol":54,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-09-01","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"sabeh beton s.r.l","site":"choueifat","product":"Kasara","trips":2,"paid_trips":2,"zero_trips":0,"qty":54,"unit_prices":[23.5],"mat_rev":1269,"trans_units":[2],"trans_rev":108,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-15","max_date":"2026-10-15","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"sabeh beton s.r.l (choueifat)","vol":54,"ot_allow":0,"first_dt":"2026-10-15","last_dt":"2026-10-15","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"haj ibrahim","site":"afak","product":"Mghasal","trips":2,"paid_trips":2,"zero_trips":0,"qty":54,"unit_prices":[23],"mat_rev":1242,"trans_units":[2],"trans_rev":108,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-17","max_date":"2026-10-23","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"haj ibrahim (afak)","vol":54,"ot_allow":0,"first_dt":"2026-10-17","last_dt":"2026-10-23","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"Jad Bdeir","site":"al jawad","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"unit_prices":[0],"mat_rev":0,"trans_units":[5],"trans_rev":135,"per_trip":135,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-12","max_date":"2026-09-12","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($135.00/trip at $5.0/m³).","site_label":"Jad Bdeir (al jawad)","vol":27,"ot_allow":0,"first_dt":"2026-09-12","last_dt":"2026-09-12","status_full":"Strong Rate ($95+/trip): High-yield long haul ($135.00/trip at $5.0/m³)."},{"truck":"Tb9","co":"WTC","customer":"SOIme choueifat","site":"choueifat","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"unit_prices":[14.5],"mat_rev":687.08,"trans_units":[1.25],"trans_rev":59.23,"per_trip":59.23,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-29","max_date":"2026-09-29","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($59.23/trip at $1.25/m³).","site_label":"SOIme choueifat (choueifat)","vol":27,"ot_allow":0,"first_dt":"2026-09-29","last_dt":"2026-09-29","status_full":"Adequate: Standard urban delivery rate ($59.23/trip at $1.25/m³)."},{"truck":"Tb9","co":"WTC","customer":"SOIME CHOUEIFAT","site":"choueifat","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"unit_prices":[14.5],"mat_rev":681.07,"trans_units":[1.25],"trans_rev":58.71,"per_trip":58.71,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-30","max_date":"2026-09-30","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.71/trip at $1.25/m³).","site_label":"SOIME CHOUEIFAT (choueifat)","vol":27,"ot_allow":0,"first_dt":"2026-09-30","last_dt":"2026-09-30","status_full":"Adequate: Standard urban delivery rate ($58.71/trip at $1.25/m³)."},{"truck":"Tb9","co":"WTC","customer":"Sabeh Beton S.R.L","site":"Gisr al bacha","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"unit_prices":[23.5],"mat_rev":634.5,"trans_units":[2],"trans_rev":54,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-25","max_date":"2026-08-25","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"Sabeh Beton S.R.L (Gisr al bacha)","vol":27,"ot_allow":0,"first_dt":"2026-08-25","last_dt":"2026-08-25","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"nabih el asaad","site":"Ouzaii","product":"Mghasal 2","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"unit_prices":[21],"mat_rev":567,"trans_units":[1],"trans_rev":27,"per_trip":27,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-22","max_date":"2026-09-22","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $27.00/trip ($1.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"nabih el asaad (Ouzaii)","vol":27,"ot_allow":0,"first_dt":"2026-09-22","last_dt":"2026-09-22","status_full":"Low Rate (<$55/trip): Earns $27.00/trip ($1.0/m³); tight margin after ~18-22L diesel + driver cost."}],"raw_sites":[{"truck":"TB1","co":"WTC","site":"Al Jawad","supplier":"Hussein Hamdan","product":"Ramel Mrml","region":"Excluded","trips":89,"paid_trips":89,"zero_trips":0,"qty":2581,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":4450,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam (62), Ahmad Hamoud (25), Mohamad Habib (2)","min_date":"2026-09-07","max_date":"2026-10-23","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Al Jawad (Hussein Hamdan)","vol":2581,"trans_rev":4450,"ot_allow":0,"first_dt":"2026-09-07","last_dt":"2026-10-23","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"TB1","co":"WTC","site":"Spinneys Mar Elias","supplier":"Ebco Bitar","product":"Ramel Mrml","region":"spinneys Mar Elias","trips":32,"paid_trips":27,"zero_trips":5,"qty":928,"zero_qty":145,"mat_cost":0,"trans_units":[0,50],"haul_rev":1350,"per_trip":42.19,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam (30), Ahmad Hamoud (2)","min_date":"2026-08-31","max_date":"2026-10-06","status":"Partial $0 (5 of 32 trips $0)","est_missing":250,"note":"5 of 32 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","zero_dates":["2026-08-31"],"site_label":"Spinneys Mar Elias (Ebco Bitar)","vol":928,"trans_rev":1350,"ot_allow":0,"first_dt":"2026-08-31","last_dt":"2026-10-06","status_full":"Partial $0 (5 of 32 trips $0): 5 of 32 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip."},{"truck":"TB1","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Dabsh","region":"Excluded","trips":26,"paid_trips":0,"zero_trips":26,"qty":754,"zero_qty":754,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-23","max_date":"2026-10-20","status":"No BBC Rule ($0 Haulage)","est_missing":1300,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (26 trips of Dabsh = $0; benchmark $1,300.00 at $50/trip).","zero_dates":["2026-09-23","2026-09-26","2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02","2026-10-06","2026-10-07","2026-10-09","2026-10-10","2026-10-12","2026-10-15","2026-10-16","2026-10-17","2026-10-20"],"site_label":"Al Jawad (Aljawad)","vol":754,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-23","last_dt":"2026-10-20","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (26 trips of Dabsh = $0; benchmark $1,300.00 at $50/trip)."},{"truck":"TB1","co":"WTC","site":"Sibline","supplier":"Sibline","product":"Radm","region":"Sibline","trips":25,"paid_trips":25,"zero_trips":0,"qty":725,"zero_qty":0,"mat_cost":0,"trans_units":[80],"haul_rev":2000,"per_trip":80,"ot_trips":24,"ot_amt":240,"drivers":"Majed Karam (12), Ahmad Hamoud (12), Mohamad Habib (1)","min_date":"2026-10-01","max_date":"2026-10-23","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $80/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Sibline","vol":725,"trans_rev":2000,"ot_allow":240,"first_dt":"2026-10-01","last_dt":"2026-10-23","status_full":"Strong Rate ($80/trip): Flat rate $80/truck via WTC OwnerAdj."},{"truck":"TB1","co":"BBConstruction","site":"WTC","supplier":"wtc","product":"Dabsh","region":"Excluded","trips":21,"paid_trips":0,"zero_trips":21,"qty":601,"zero_qty":601,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-24","max_date":"2026-10-20","status":"Inter-Plant Haul ($0 Haulage)","est_missing":1442.4,"note":"Hauling Dabsh from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (21 trips = $0; $1,442.40 at $2.40/m³).","zero_dates":["2026-08-24","2026-08-25","2026-08-26","2026-08-31","2026-09-03","2026-09-04","2026-09-05","2026-09-07","2026-09-08","2026-09-09","2026-09-12","2026-09-18","2026-09-20","2026-09-30","2026-10-03","2026-10-19","2026-10-20"],"site_label":"WTC","vol":601,"trans_rev":0,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-10-20","status_full":"Inter-Plant Haul ($0 Haulage): Hauling Dabsh from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (21 trips = $0; $1,442.40 at $2.40/m³)."},{"truck":"TB1","co":"BBConstruction","site":"Wael El Haj","supplier":"Wael el Haj","product":"Trab Mrml","region":"Excluded","trips":14,"paid_trips":0,"zero_trips":14,"qty":406,"zero_qty":406,"mat_cost":2030,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-26","max_date":"2026-09-03","status":"Formula Bug ($0 Haulage)","est_missing":1624,"note":"BBC OwnerAdj idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in TrucksAdj, and omitted Hussein Bdeir. Missing $1,624.00.","zero_dates":["2026-08-26","2026-08-28","2026-09-01","2026-09-02","2026-09-03"],"site_label":"Wael El Haj","vol":406,"trans_rev":0,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-09-03","status_full":"Formula Bug ($0 Haulage): BBC OwnerAdj idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in TrucksAdj, and omitted Hussein Bdeir. Missing $1,624.00."},{"truck":"TB1","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"Ramel Mrml","region":"Excluded","trips":10,"paid_trips":10,"zero_trips":0,"qty":290,"zero_qty":0,"mat_cost":1740,"trans_units":[50],"haul_rev":500,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-03","max_date":"2026-09-29","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Ali Klait","vol":290,"trans_rev":500,"ot_allow":0,"first_dt":"2026-09-03","last_dt":"2026-09-29","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"TB1","co":"WTC","site":"Elias Hassan","supplier":"Elias Hassan","product":"Ramel Mrml","region":"Excluded","trips":7,"paid_trips":7,"zero_trips":0,"qty":203,"zero_qty":0,"mat_cost":675,"trans_units":[50],"haul_rev":350,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-16","max_date":"2026-09-21","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Elias Hassan","vol":203,"trans_rev":350,"ot_allow":0,"first_dt":"2026-09-16","last_dt":"2026-09-21","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"TB1","co":"WTC","site":"Radwan Sidani","supplier":"Radwan Sidani","product":"Ramel Mrml","region":"Mar Elias","trips":7,"paid_trips":6,"zero_trips":1,"qty":203,"zero_qty":29,"mat_cost":0,"trans_units":[0,50],"haul_rev":300,"per_trip":42.86,"ot_trips":0,"ot_amt":0,"drivers":"Ahmad Hamoud (4), Majed Karam (3)","min_date":"2026-08-24","max_date":"2026-10-07","status":"Partial $0 (1 of 7 trips $0)","est_missing":50,"note":"1 of 7 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","zero_dates":["2026-08-24"],"site_label":"Radwan Sidani","vol":203,"trans_rev":300,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-10-07","status_full":"Partial $0 (1 of 7 trips $0): 1 of 7 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip."},{"truck":"TB1","co":"BBConstruction","site":"WTC","supplier":"wtc","product":"Raml Bab Thani","region":"Excluded","trips":6,"paid_trips":0,"zero_trips":6,"qty":174,"zero_qty":174,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-10-13","max_date":"2026-10-19","status":"Inter-Plant Haul ($0 Haulage)","est_missing":417.6,"note":"Hauling Raml Bab Thani from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (6 trips = $0; $417.60 at $2.40/m³).","zero_dates":["2026-10-13","2026-10-14","2026-10-19"],"site_label":"WTC","vol":174,"trans_rev":0,"ot_allow":0,"first_dt":"2026-10-13","last_dt":"2026-10-19","status_full":"Inter-Plant Haul ($0 Haulage): Hauling Raml Bab Thani from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (6 trips = $0; $417.60 at $2.40/m³)."},{"truck":"TB1","co":"WTC","site":"Sibline","supplier":"Sibline","product":"Ramel Mrml","region":"Sibline","trips":5,"paid_trips":0,"zero_trips":5,"qty":145,"zero_qty":145,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":5,"ot_amt":50,"drivers":"Ahmad Hamoud","min_date":"2026-10-12","max_date":"2026-10-12","status":"Missing Product Rule ($0 Haulage)","est_missing":400,"note":"WTC OwnerAdj $80/truck rule for Sibline only covers Product='Radm', so 5 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $400.00.","zero_dates":["2026-10-12"],"site_label":"Sibline","vol":145,"trans_rev":0,"ot_allow":50,"first_dt":"2026-10-12","last_dt":"2026-10-12","status_full":"Missing Product Rule ($0 Haulage): WTC OwnerAdj $80/truck rule for Sibline only covers Product='Radm', so 5 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $400.00."},{"truck":"TB1","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Ramel Mrml","region":"Excluded","trips":5,"paid_trips":0,"zero_trips":5,"qty":145,"zero_qty":145,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-14","max_date":"2026-09-24","status":"No BBC Rule ($0 Haulage)","est_missing":250,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (5 trips of Ramel Mrml = $0; benchmark $250.00 at $50/trip).","zero_dates":["2026-09-14","2026-09-15","2026-09-16","2026-09-17","2026-09-24"],"site_label":"Al Jawad (Aljawad)","vol":145,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-24","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (5 trips of Ramel Mrml = $0; benchmark $250.00 at $50/trip)."},{"truck":"TB1","co":"WTC","site":"Ibrahim Bdeir Aawkar","supplier":"Haj Ibrahim","product":"Ramel Mrml","region":"Excluded","trips":3,"paid_trips":3,"zero_trips":0,"qty":87,"zero_qty":0,"mat_cost":150,"trans_units":[120],"haul_rev":360,"per_trip":120,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-26","max_date":"2026-08-28","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $120/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Ibrahim Bdeir Aawkar (Haj Ibrahim)","vol":87,"trans_rev":360,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-08-28","status_full":"Strong Rate ($80/trip): Flat rate $120/truck via WTC OwnerAdj."},{"truck":"TB1","co":"WTC","site":"Al Jnah","supplier":"Hassib Ibrahim","product":"Ramel Mrml","region":"Excluded","trips":3,"paid_trips":3,"zero_trips":0,"qty":87,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":150,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-10","max_date":"2026-09-10","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Al Jnah (Hassib Ibrahim)","vol":87,"trans_rev":150,"ot_allow":0,"first_dt":"2026-09-10","last_dt":"2026-09-10","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"TB1","co":"WTC","site":"Sabeh Beton","supplier":"sabeh beton","product":"Radm","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"zero_qty":0,"mat_cost":-90,"trans_units":[75],"haul_rev":150,"per_trip":75,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-14","max_date":"2026-09-24","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $75/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Sabeh Beton","vol":58,"trans_rev":150,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-24","status_full":"Strong Rate ($80/trip): Flat rate $75/truck via WTC OwnerAdj."},{"truck":"TB1","co":"WTC","site":"Radm Spinneys","supplier":"Haj Ali Bdeir","product":"Ramel Mrml","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":100,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-08","max_date":"2026-09-08","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Radm Spinneys (Haj Ali Bdeir)","vol":58,"trans_rev":100,"ot_allow":0,"first_dt":"2026-09-08","last_dt":"2026-09-08","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"TB1","co":"WTC","site":"Elias Hassan","supplier":"Elias Hassan","product":"Radm","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"zero_qty":0,"mat_cost":-100,"trans_units":[50],"haul_rev":100,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-18","max_date":"2026-09-18","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Elias Hassan","vol":58,"trans_rev":100,"ot_allow":0,"first_dt":"2026-09-18","last_dt":"2026-09-18","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"TB1","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"SAND","region":"Excluded","trips":1,"paid_trips":0,"zero_trips":1,"qty":29,"zero_qty":29,"mat_cost":435,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-14","max_date":"2026-09-14","status":"Missing Product Rule ($0 Haulage)","est_missing":50,"note":"WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 1 loads of 'SAND' got $0. Missing $50.00.","zero_dates":["2026-09-14"],"site_label":"Ali Klait","vol":29,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-14","status_full":"Missing Product Rule ($0 Haulage): WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 1 loads of 'SAND' got $0. Missing $50.00."},{"truck":"Tb7","co":"WTC","site":"Al Jawad","supplier":"Hussein Hamdan","product":"Ramel Mrml","region":"Excluded","trips":44,"paid_trips":44,"zero_trips":0,"qty":1244,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":2200,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-08","max_date":"2026-10-22","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Al Jawad (Hussein Hamdan)","vol":1244,"trans_rev":2200,"ot_allow":0,"first_dt":"2026-09-08","last_dt":"2026-10-22","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"Tb7","co":"WTC","site":"Sibline","supplier":"Sibline","product":"Radm","region":"Sibline","trips":32,"paid_trips":32,"zero_trips":0,"qty":922,"zero_qty":0,"mat_cost":0,"trans_units":[80],"haul_rev":2560,"per_trip":80,"ot_trips":30,"ot_amt":300,"drivers":"Mohamad Habib","min_date":"2026-10-01","max_date":"2026-10-23","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $80/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Sibline","vol":922,"trans_rev":2560,"ot_allow":300,"first_dt":"2026-10-01","last_dt":"2026-10-23","status_full":"Strong Rate ($80/trip): Flat rate $80/truck via WTC OwnerAdj."},{"truck":"Tb7","co":"BBConstruction","site":"WTC","supplier":"wtc","product":"Dabsh","region":"Excluded","trips":13,"paid_trips":0,"zero_trips":13,"qty":365,"zero_qty":365,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-26","max_date":"2026-09-24","status":"Inter-Plant Haul ($0 Haulage)","est_missing":876,"note":"Hauling Dabsh from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (13 trips = $0; $876.00 at $2.40/m³).","zero_dates":["2026-08-26","2026-09-07","2026-09-08","2026-09-09","2026-09-11","2026-09-12","2026-09-14","2026-09-17","2026-09-21","2026-09-24"],"site_label":"WTC","vol":365,"trans_rev":0,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-09-24","status_full":"Inter-Plant Haul ($0 Haulage): Hauling Dabsh from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (13 trips = $0; $876.00 at $2.40/m³)."},{"truck":"Tb7","co":"WTC","site":"Sibline","supplier":"Sibline","product":"Ramel Mrml","region":"Sibline","trips":11,"paid_trips":0,"zero_trips":11,"qty":319,"zero_qty":319,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":11,"ot_amt":110,"drivers":"Mohamad Habib","min_date":"2026-10-12","max_date":"2026-10-12","status":"Missing Product Rule ($0 Haulage)","est_missing":880,"note":"WTC OwnerAdj $80/truck rule for Sibline only covers Product='Radm', so 11 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $880.00.","zero_dates":["2026-10-12"],"site_label":"Sibline","vol":319,"trans_rev":0,"ot_allow":110,"first_dt":"2026-10-12","last_dt":"2026-10-12","status_full":"Missing Product Rule ($0 Haulage): WTC OwnerAdj $80/truck rule for Sibline only covers Product='Radm', so 11 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $880.00."},{"truck":"Tb7","co":"BBConstruction","site":"Wael El Haj","supplier":"Wael el Haj","product":"Trab Mrml","region":"Excluded","trips":11,"paid_trips":0,"zero_trips":11,"qty":308,"zero_qty":308,"mat_cost":1540,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-26","max_date":"2026-09-02","status":"Formula Bug ($0 Haulage)","est_missing":1232,"note":"BBC OwnerAdj idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in TrucksAdj, and omitted Hussein Bdeir. Missing $1,232.00.","zero_dates":["2026-08-26","2026-08-28","2026-09-01","2026-09-02"],"site_label":"Wael El Haj","vol":308,"trans_rev":0,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-09-02","status_full":"Formula Bug ($0 Haulage): BBC OwnerAdj idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in TrucksAdj, and omitted Hussein Bdeir. Missing $1,232.00."},{"truck":"Tb7","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Dabsh","region":"Excluded","trips":11,"paid_trips":0,"zero_trips":11,"qty":319,"zero_qty":319,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-30","max_date":"2026-10-22","status":"No BBC Rule ($0 Haulage)","est_missing":550,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (11 trips of Dabsh = $0; benchmark $550.00 at $50/trip).","zero_dates":["2026-09-30","2026-10-01","2026-10-03","2026-10-06","2026-10-07","2026-10-09","2026-10-15","2026-10-17","2026-10-22"],"site_label":"Al Jawad (Aljawad)","vol":319,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-30","last_dt":"2026-10-22","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (11 trips of Dabsh = $0; benchmark $550.00 at $50/trip)."},{"truck":"Tb7","co":"WTC","site":"Spinneys Mar Elias","supplier":"Ebco Bitar","product":"Ramel Mrml","region":"spinneys Mar Elias","trips":5,"paid_trips":5,"zero_trips":0,"qty":142,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":250,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-10","max_date":"2026-10-08","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Spinneys Mar Elias (Ebco Bitar)","vol":142,"trans_rev":250,"ot_allow":0,"first_dt":"2026-09-10","last_dt":"2026-10-08","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"Tb7","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Ramel Mrml","region":"Excluded","trips":4,"paid_trips":0,"zero_trips":4,"qty":113,"zero_qty":113,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-14","max_date":"2026-09-24","status":"No BBC Rule ($0 Haulage)","est_missing":200,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (4 trips of Ramel Mrml = $0; benchmark $200.00 at $50/trip).","zero_dates":["2026-09-14","2026-09-15","2026-09-16","2026-09-24"],"site_label":"Al Jawad (Aljawad)","vol":113,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-24","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (4 trips of Ramel Mrml = $0; benchmark $200.00 at $50/trip)."},{"truck":"Tb7","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"Ramel Mrml","region":"Excluded","trips":3,"paid_trips":1,"zero_trips":2,"qty":82,"zero_qty":54,"mat_cost":492,"trans_units":[0,50],"haul_rev":50,"per_trip":16.67,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-03","max_date":"2026-09-15","status":"Partial $0 (2 of 3 trips $0)","est_missing":100,"note":"2 of 3 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","zero_dates":["2026-09-03"],"site_label":"Ali Klait","vol":82,"trans_rev":50,"ot_allow":0,"first_dt":"2026-09-03","last_dt":"2026-09-15","status_full":"Partial $0 (2 of 3 trips $0): 2 of 3 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip."},{"truck":"Tb7","co":"WTC","site":"Sabeh Beton","supplier":"sabeh beton","product":"Radm","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":56,"zero_qty":0,"mat_cost":-180,"trans_units":[75],"haul_rev":150,"per_trip":75,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-22","max_date":"2026-09-24","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $75/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Sabeh Beton","vol":56,"trans_rev":150,"ot_allow":0,"first_dt":"2026-09-22","last_dt":"2026-09-24","status_full":"Strong Rate ($80/trip): Flat rate $75/truck via WTC OwnerAdj."},{"truck":"Tb7","co":"WTC","site":"Radm Spinneys","supplier":"Haj Ali Bdeir","product":"Ramel Mrml","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":56,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":100,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-08","max_date":"2026-09-08","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Radm Spinneys (Haj Ali Bdeir)","vol":56,"trans_rev":100,"ot_allow":0,"first_dt":"2026-09-08","last_dt":"2026-09-08","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"Tb7","co":"WTC","site":"Mega Beton","supplier":"mega beton","product":"Radm","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":56,"zero_qty":0,"mat_cost":-160,"trans_units":[50],"haul_rev":100,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-22","max_date":"2026-09-24","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Mega Beton","vol":56,"trans_rev":100,"ot_allow":0,"first_dt":"2026-09-22","last_dt":"2026-09-24","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"Tb7","co":"WTC","site":"Radwan Sidani","supplier":"Radwan Sidani","product":"Ramel Mrml","region":"Mar Elias","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":100,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-10-05","max_date":"2026-10-05","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Radwan Sidani","vol":58,"trans_rev":100,"ot_allow":0,"first_dt":"2026-10-05","last_dt":"2026-10-05","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"Tb7","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"SAND","region":"Excluded","trips":2,"paid_trips":0,"zero_trips":2,"qty":56,"zero_qty":56,"mat_cost":840,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-18","max_date":"2026-09-18","status":"Missing Product Rule ($0 Haulage)","est_missing":100,"note":"WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'SAND' got $0. Missing $100.00.","zero_dates":["2026-09-18"],"site_label":"Ali Klait","vol":56,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-18","last_dt":"2026-09-18","status_full":"Missing Product Rule ($0 Haulage): WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'SAND' got $0. Missing $100.00."},{"truck":"Tb7","co":"WTC","site":"Radm","supplier":"Haj Ali Bdeir","product":"Ramel Mrml","region":"Excluded","trips":1,"paid_trips":1,"zero_trips":0,"qty":28,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":50,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-28","max_date":"2026-08-28","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Radm (Haj Ali Bdeir)","vol":28,"trans_rev":50,"ot_allow":0,"first_dt":"2026-08-28","last_dt":"2026-08-28","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"Tb9","co":"WTC","site":"Al Jawad","supplier":"Hussein Hamdan","product":"Ramel Mrml","region":"Excluded","trips":73,"paid_trips":73,"zero_trips":0,"qty":1971,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":3650,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-07","max_date":"2026-10-22","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Al Jawad (Hussein Hamdan)","vol":1971,"trans_rev":3650,"ot_allow":0,"first_dt":"2026-09-07","last_dt":"2026-10-22","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"Tb9","co":"WTC","site":"Spinneys Mar Elias","supplier":"Ebco Bitar","product":"Ramel Mrml","region":"spinneys Mar Elias","trips":70,"paid_trips":63,"zero_trips":7,"qty":1890,"zero_qty":189,"mat_cost":0,"trans_units":[0,50],"haul_rev":3150,"per_trip":45,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-31","max_date":"2026-10-15","status":"Partial $0 (7 of 70 trips $0)","est_missing":350,"note":"7 of 70 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","zero_dates":["2026-08-31"],"site_label":"Spinneys Mar Elias (Ebco Bitar)","vol":1890,"trans_rev":3150,"ot_allow":0,"first_dt":"2026-08-31","last_dt":"2026-10-15","status_full":"Partial $0 (7 of 70 trips $0): 7 of 70 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip."},{"truck":"Tb9","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"Ramel Mrml","region":"Excluded","trips":39,"paid_trips":37,"zero_trips":2,"qty":1053,"zero_qty":54,"mat_cost":6318,"trans_units":[0,50],"haul_rev":1850,"per_trip":47.44,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-03","max_date":"2026-10-02","status":"Partial $0 (2 of 39 trips $0)","est_missing":100,"note":"2 of 39 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","zero_dates":["2026-09-03"],"site_label":"Ali Klait","vol":1053,"trans_rev":1850,"ot_allow":0,"first_dt":"2026-09-03","last_dt":"2026-10-02","status_full":"Partial $0 (2 of 39 trips $0): 2 of 39 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip."},{"truck":"Tb9","co":"BBConstruction","site":"WTC","supplier":"wtc","product":"Dabsh","region":"Excluded","trips":7,"paid_trips":0,"zero_trips":7,"qty":189,"zero_qty":189,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-24","max_date":"2026-09-11","status":"Inter-Plant Haul ($0 Haulage)","est_missing":453.6,"note":"Hauling Dabsh from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (7 trips = $0; $453.60 at $2.40/m³).","zero_dates":["2026-08-24","2026-08-28","2026-08-29","2026-08-31","2026-09-11"],"site_label":"WTC","vol":189,"trans_rev":0,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-09-11","status_full":"Inter-Plant Haul ($0 Haulage): Hauling Dabsh from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (7 trips = $0; $453.60 at $2.40/m³)."},{"truck":"Tb9","co":"WTC","site":"Mega Beton","supplier":"mega beton","product":"Radm","region":"Excluded","trips":5,"paid_trips":5,"zero_trips":0,"qty":135,"zero_qty":0,"mat_cost":-400,"trans_units":[50],"haul_rev":250,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-10","max_date":"2026-09-22","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Mega Beton","vol":135,"trans_rev":250,"ot_allow":0,"first_dt":"2026-09-10","last_dt":"2026-09-22","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"Tb9","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"SAND","region":"Excluded","trips":4,"paid_trips":0,"zero_trips":4,"qty":108,"zero_qty":108,"mat_cost":1620,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-14","max_date":"2026-09-18","status":"Missing Product Rule ($0 Haulage)","est_missing":200,"note":"WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 4 loads of 'SAND' got $0. Missing $200.00.","zero_dates":["2026-09-14","2026-09-18"],"site_label":"Ali Klait","vol":108,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-18","status_full":"Missing Product Rule ($0 Haulage): WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 4 loads of 'SAND' got $0. Missing $200.00."},{"truck":"Tb9","co":"WTC","site":"Ibrahim Bdeir Aawkar","supplier":"Haj Ibrahim","product":"Ramel Mrml","region":"Excluded","trips":3,"paid_trips":3,"zero_trips":0,"qty":81,"zero_qty":0,"mat_cost":150,"trans_units":[120],"haul_rev":360,"per_trip":120,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-26","max_date":"2026-08-28","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $120/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Ibrahim Bdeir Aawkar (Haj Ibrahim)","vol":81,"trans_rev":360,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-08-28","status_full":"Strong Rate ($80/trip): Flat rate $120/truck via WTC OwnerAdj."},{"truck":"Tb9","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Dabsh","region":"Excluded","trips":3,"paid_trips":0,"zero_trips":3,"qty":81,"zero_qty":81,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-24","max_date":"2026-10-22","status":"No BBC Rule ($0 Haulage)","est_missing":150,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (3 trips of Dabsh = $0; benchmark $150.00 at $50/trip).","zero_dates":["2026-09-24","2026-10-07","2026-10-22"],"site_label":"Al Jawad (Aljawad)","vol":81,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-24","last_dt":"2026-10-22","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (3 trips of Dabsh = $0; benchmark $150.00 at $50/trip)."},{"truck":"Tb9","co":"BBConstruction","site":"WTC","supplier":"wtc","product":"Raml Bab Thani","region":"Excluded","trips":3,"paid_trips":0,"zero_trips":3,"qty":81,"zero_qty":81,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-13","max_date":"2026-10-14","status":"Inter-Plant Haul ($0 Haulage)","est_missing":194.4,"note":"Hauling Raml Bab Thani from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (3 trips = $0; $194.40 at $2.40/m³).","zero_dates":["2026-10-13","2026-10-14"],"site_label":"WTC","vol":81,"trans_rev":0,"ot_allow":0,"first_dt":"2026-10-13","last_dt":"2026-10-14","status_full":"Inter-Plant Haul ($0 Haulage): Hauling Raml Bab Thani from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (3 trips = $0; $194.40 at $2.40/m³)."},{"truck":"Tb9","co":"WTC","site":"Radwan Sidani","supplier":"Radwan Sidani","product":"Ramel Mrml","region":"Mar Elias","trips":2,"paid_trips":1,"zero_trips":1,"qty":54,"zero_qty":27,"mat_cost":0,"trans_units":[0,50],"haul_rev":50,"per_trip":25,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-24","max_date":"2026-10-22","status":"Partial $0 (1 of 2 trips $0)","est_missing":50,"note":"1 of 2 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","zero_dates":["2026-08-24"],"site_label":"Radwan Sidani","vol":54,"trans_rev":50,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-10-22","status_full":"Partial $0 (1 of 2 trips $0): 1 of 2 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip."},{"truck":"Tb9","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"Soil","region":"Excluded","trips":2,"paid_trips":0,"zero_trips":2,"qty":54,"zero_qty":54,"mat_cost":378,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-14","max_date":"2026-09-14","status":"Missing Product Rule ($0 Haulage)","est_missing":100,"note":"WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'Soil' got $0. Missing $100.00.","zero_dates":["2026-09-14"],"site_label":"Ali Klait","vol":54,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-14","status_full":"Missing Product Rule ($0 Haulage): WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'Soil' got $0. Missing $100.00."},{"truck":"Tb9","co":"WTC","site":"Sibline","supplier":"Sibline","product":"Radm","region":"Sibline","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"zero_qty":0,"mat_cost":0,"trans_units":[80],"haul_rev":80,"per_trip":80,"ot_trips":1,"ot_amt":10,"drivers":"Ali Saleh","min_date":"2026-10-01","max_date":"2026-10-01","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $80/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Sibline","vol":27,"trans_rev":80,"ot_allow":10,"first_dt":"2026-10-01","last_dt":"2026-10-01","status_full":"Strong Rate ($80/trip): Flat rate $80/truck via WTC OwnerAdj."},{"truck":"Tb9","co":"WTC","site":"Radm Spinneys","supplier":"Haj Ali Bdeir","product":"Ramel Mrml","region":"Excluded","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":50,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-10","max_date":"2026-09-10","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC OwnerAdj.","zero_dates":[],"site_label":"Radm Spinneys (Haj Ali Bdeir)","vol":27,"trans_rev":50,"ot_allow":0,"first_dt":"2026-09-10","last_dt":"2026-09-10","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC OwnerAdj."},{"truck":"Tb9","co":"WTC","site":"Amhaz Mathaf","supplier":"Hassan Amhaz","product":"Ramel Mrml","region":"Excluded","trips":1,"paid_trips":0,"zero_trips":1,"qty":27,"zero_qty":27,"mat_cost":75,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-23","max_date":"2026-10-23","status":"Owner=WTC Lag / Missing Rule ($0 Haulage)","est_missing":50,"note":"Amhaz Mathaf (Oct 23, Inv #19973) has no rate rule in WTC Hauler Rate Schedule ($0 instead of $50/trip).","zero_dates":["2026-10-23"],"site_label":"Amhaz Mathaf (Hassan Amhaz)","vol":27,"trans_rev":0,"ot_allow":0,"first_dt":"2026-10-23","last_dt":"2026-10-23","status_full":"Owner=WTC Lag / Missing Rule ($0 Haulage): Amhaz Mathaf (Oct 23, Inv #19973) has no rate rule in WTC Hauler Rate Schedule ($0 instead of $50/trip)."},{"truck":"Tb9","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Ramel Mrml","region":"Excluded","trips":1,"paid_trips":0,"zero_trips":1,"qty":27,"zero_qty":27,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-14","max_date":"2026-09-14","status":"No BBC Rule ($0 Haulage)","est_missing":50,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (1 trips of Ramel Mrml = $0; benchmark $50.00 at $50/trip).","zero_dates":["2026-09-14"],"site_label":"Al Jawad (Aljawad)","vol":27,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-14","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (1 trips of Ramel Mrml = $0; benchmark $50.00 at $50/trip)."}],"zero_haulage_groups":[{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"TB1","counterparty":"Ebco Bitar","site":"Spinneys Mar Elias","product":"Ramel Mrml","zero_trips":5,"total_route_trips":32,"ot_trips":0,"zero_vol":145,"dates":"2026-08-31 to 2026-08-31","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":250,"reason":"5 of 32 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","invoices":"6829, 6830, 6844, 6845, 6846","all_invoices":"6829, 6830, 6844, 6845, 6846"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"TB1","counterparty":"Sibline","site":"Sibline","product":"Ramel Mrml","zero_trips":5,"total_route_trips":5,"ot_trips":5,"zero_vol":145,"dates":"2026-10-12 to 2026-10-12","fair_rate_basis":"$80.00/truck (WTC OwnerAdj Sibline Rate)","est_missing":400,"reason":"WTC OwnerAdj $80/truck rule for Sibline only covers Product='Radm', so 5 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $400.00.","invoices":"19476, 19483, 19486, 19490, 19500","all_invoices":"19476, 19483, 19486, 19490, 19500"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"TB1","counterparty":"Radwan Sidani","site":"Radwan Sidani","product":"Ramel Mrml","zero_trips":1,"total_route_trips":7,"ot_trips":0,"zero_vol":29,"dates":"2026-08-24 to 2026-08-24","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":50,"reason":"1 of 7 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","invoices":"15806","all_invoices":"15806"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"TB1","counterparty":"Ali Klait","site":"Ali Klait","product":"SAND","zero_trips":1,"total_route_trips":1,"ot_trips":0,"zero_vol":29,"dates":"2026-09-14 to 2026-09-14","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":50,"reason":"WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 1 loads of 'SAND' got $0. Missing $50.00.","invoices":"17279","all_invoices":"17279"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb7","counterparty":"Sibline","site":"Sibline","product":"Ramel Mrml","zero_trips":11,"total_route_trips":11,"ot_trips":11,"zero_vol":319,"dates":"2026-10-12 to 2026-10-12","fair_rate_basis":"$80.00/truck (WTC OwnerAdj Sibline Rate)","est_missing":880,"reason":"WTC OwnerAdj $80/truck rule for Sibline only covers Product='Radm', so 11 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $880.00.","invoices":"19477, 19481, 19482, 19484, 19485, 19492, 19494, 19495, 19497, 19498, 19499","all_invoices":"19477, 19481, 19482, 19484, 19485, 19492, 19494, 19495, 19497, 19498, 19499"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb7","counterparty":"Ali Klait","site":"Ali Klait","product":"Ramel Mrml","zero_trips":2,"total_route_trips":3,"ot_trips":0,"zero_vol":54,"dates":"2026-09-03 to 2026-09-03","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":100,"reason":"2 of 3 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","invoices":"17031, 17033","all_invoices":"17031, 17033"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb7","counterparty":"Ali Klait","site":"Ali Klait","product":"SAND","zero_trips":2,"total_route_trips":2,"ot_trips":0,"zero_vol":56,"dates":"2026-09-18 to 2026-09-18","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":100,"reason":"WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'SAND' got $0. Missing $100.00.","invoices":"17288, 17290","all_invoices":"17288, 17290"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Ebco Bitar","site":"Spinneys Mar Elias","product":"Ramel Mrml","zero_trips":7,"total_route_trips":70,"ot_trips":0,"zero_vol":189,"dates":"2026-08-31 to 2026-08-31","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":350,"reason":"7 of 70 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","invoices":"6831, 6838, 6839, 6840, 6849, 6850, 23051","all_invoices":"6831, 6838, 6839, 6840, 6849, 6850, 23051"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Ali Klait","site":"Ali Klait","product":"SAND","zero_trips":4,"total_route_trips":4,"ot_trips":0,"zero_vol":108,"dates":"2026-09-14 to 2026-09-18","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":200,"reason":"WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 4 loads of 'SAND' got $0. Missing $200.00.","invoices":"17276, 17282, 17283, 17287","all_invoices":"17276, 17282, 17283, 17287"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Ali Klait","site":"Ali Klait","product":"Ramel Mrml","zero_trips":2,"total_route_trips":39,"ot_trips":0,"zero_vol":54,"dates":"2026-09-03 to 2026-09-03","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":100,"reason":"2 of 39 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","invoices":"17030, 17032","all_invoices":"17030, 17032"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Ali Klait","site":"Ali Klait","product":"Soil","zero_trips":2,"total_route_trips":2,"ot_trips":0,"zero_vol":54,"dates":"2026-09-14 to 2026-09-14","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":100,"reason":"WTC OwnerAdj $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'Soil' got $0. Missing $100.00.","invoices":"17143, 17150","all_invoices":"17143, 17150"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Radwan Sidani","site":"Radwan Sidani","product":"Ramel Mrml","zero_trips":1,"total_route_trips":2,"ot_trips":0,"zero_vol":27,"dates":"2026-08-24 to 2026-08-24","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":50,"reason":"1 of 2 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in SP Raw Material Register before Sep 4 TrucksAdj cutover date and got $0 instead of $50/trip.","invoices":"15805","all_invoices":"15805"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Hassan Amhaz","site":"Amhaz Mathaf","product":"Ramel Mrml","zero_trips":1,"total_route_trips":1,"ot_trips":0,"zero_vol":27,"dates":"2026-10-23 to 2026-10-23","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":50,"reason":"Amhaz Mathaf (Oct 23, Inv #19973) has no rate rule in WTC Hauler Rate Schedule ($0 instead of $50/trip).","invoices":"19973","all_invoices":"19973"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Aljawad","site":"Al Jawad","product":"Dabsh","zero_trips":26,"total_route_trips":26,"ot_trips":0,"zero_vol":754,"dates":"2026-09-23 to 2026-10-20","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":1300,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (26 trips of Dabsh = $0; benchmark $1,300.00 at $50/trip).","invoices":"39076, 39078, 39079, 39080, 39081, 39082, 39083, 39085, 39087, 39089, 39091, 39094 (+14 more)","all_invoices":"39076, 39078, 39079, 39080, 39081, 39082, 39083, 39085, 39087, 39089, 39091, 39094, 39096, 39099, 36176, 36178, 36180, 36181, 36195, 36196, 36199, 36200, 36202, 36203, 36204, 36208"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"TB1","counterparty":"wtc","site":"WTC","product":"Dabsh","zero_trips":21,"total_route_trips":21,"ot_trips":0,"zero_vol":601,"dates":"2026-08-24 to 2026-10-20","fair_rate_basis":"$2.40/m³ (BBC OwnerAdj idx=8 Rate)","est_missing":1442.4,"reason":"Hauling Dabsh from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (21 trips = $0; $1,442.40 at $2.40/m³).","invoices":"39033, 39034, 39035, 39036, 39040, 39047, 39050, 39051, 39053, 39055, 39057, 39058 (+9 more)","all_invoices":"39033, 39034, 39035, 39036, 39040, 39047, 39050, 39051, 39053, 39055, 39057, 39058, 39061, 39064, 39068, 39071, 39075, 39086, 39092, 36206, 36211"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Wael el Haj","site":"Wael El Haj","product":"Trab Mrml","zero_trips":14,"total_route_trips":14,"ot_trips":0,"zero_vol":406,"dates":"2026-08-26 to 2026-09-03","fair_rate_basis":"$4.00/m³ (BBC OwnerAdj idx=22)","est_missing":1624,"reason":"BBC OwnerAdj idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in TrucksAdj, and omitted Hussein Bdeir. Missing $1,624.00.","invoices":"39712, 39716, 39718, 39720, 39721, 39724, 39727, 39730, 39735, 39739, 39743, 39745 (+2 more)","all_invoices":"39712, 39716, 39718, 39720, 39721, 39724, 39727, 39730, 39735, 39739, 39743, 39745, 39746, 39151"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"TB1","counterparty":"wtc","site":"WTC","product":"Raml Bab Thani","zero_trips":6,"total_route_trips":6,"ot_trips":0,"zero_vol":174,"dates":"2026-10-13 to 2026-10-19","fair_rate_basis":"$2.40/m³ (BBC OwnerAdj idx=8 Rate)","est_missing":417.6,"reason":"Hauling Raml Bab Thani from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (6 trips = $0; $417.60 at $2.40/m³).","invoices":"36183, 36189, 36190, 36191, 36194, 36207","all_invoices":"36183, 36189, 36190, 36191, 36194, 36207"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Aljawad","site":"Al Jawad","product":"Ramel Mrml","zero_trips":5,"total_route_trips":5,"ot_trips":0,"zero_vol":145,"dates":"2026-09-14 to 2026-09-24","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":250,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (5 trips of Ramel Mrml = $0; benchmark $250.00 at $50/trip).","invoices":"36152, 36157, 36158, 36160, 36161","all_invoices":"36152, 36157, 36158, 36160, 36161"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"wtc","site":"WTC","product":"Dabsh","zero_trips":13,"total_route_trips":13,"ot_trips":0,"zero_vol":365,"dates":"2026-08-26 to 2026-09-24","fair_rate_basis":"$2.40/m³ (BBC OwnerAdj idx=8 Rate)","est_missing":876,"reason":"Hauling Dabsh from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (13 trips = $0; $876.00 at $2.40/m³).","invoices":"39038, 39039, 39059, 39060, 39062, 39063, 39066, 39067, 39069, 39070, 39072, 39073 (+1 more)","all_invoices":"39038, 39039, 39059, 39060, 39062, 39063, 39066, 39067, 39069, 39070, 39072, 39073, 39074"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Wael el Haj","site":"Wael El Haj","product":"Trab Mrml","zero_trips":11,"total_route_trips":11,"ot_trips":0,"zero_vol":308,"dates":"2026-08-26 to 2026-09-02","fair_rate_basis":"$4.00/m³ (BBC OwnerAdj idx=22)","est_missing":1232,"reason":"BBC OwnerAdj idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in TrucksAdj, and omitted Hussein Bdeir. Missing $1,232.00.","invoices":"39713, 39715, 39726, 39728, 39729, 39731, 39732, 39733, 39736, 39740, 39741","all_invoices":"39713, 39715, 39726, 39728, 39729, 39731, 39732, 39733, 39736, 39740, 39741"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Aljawad","site":"Al Jawad","product":"Dabsh","zero_trips":11,"total_route_trips":11,"ot_trips":0,"zero_vol":319,"dates":"2026-09-30 to 2026-10-22","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":550,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (11 trips of Dabsh = $0; benchmark $550.00 at $50/trip).","invoices":"39084, 39088, 39093, 39095, 39097, 39100, 36177, 36179, 36198, 36205, 36214","all_invoices":"39084, 39088, 39093, 39095, 39097, 39100, 36177, 36179, 36198, 36205, 36214"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Aljawad","site":"Al Jawad","product":"Ramel Mrml","zero_trips":4,"total_route_trips":4,"ot_trips":0,"zero_vol":113,"dates":"2026-09-14 to 2026-09-24","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":200,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (4 trips of Ramel Mrml = $0; benchmark $200.00 at $50/trip).","invoices":"36153, 36156, 36159, 36162","all_invoices":"36153, 36156, 36159, 36162"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb9","counterparty":"wtc","site":"WTC","product":"Dabsh","zero_trips":7,"total_route_trips":7,"ot_trips":0,"zero_vol":189,"dates":"2026-08-24 to 2026-09-11","fair_rate_basis":"$2.40/m³ (BBC OwnerAdj idx=8 Rate)","est_missing":453.6,"reason":"Hauling Dabsh from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (7 trips = $0; $453.60 at $2.40/m³).","invoices":"39031, 39041, 39042, 39044, 39046, 39049, 39065","all_invoices":"39031, 39041, 39042, 39044, 39046, 39049, 39065"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb9","counterparty":"Aljawad","site":"Al Jawad","product":"Dabsh","zero_trips":3,"total_route_trips":3,"ot_trips":0,"zero_vol":81,"dates":"2026-09-24 to 2026-10-22","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":150,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (3 trips of Dabsh = $0; benchmark $150.00 at $50/trip).","invoices":"39077, 39098, 36213","all_invoices":"39077, 39098, 36213"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb9","counterparty":"wtc","site":"WTC","product":"Raml Bab Thani","zero_trips":3,"total_route_trips":3,"ot_trips":0,"zero_vol":81,"dates":"2026-10-13 to 2026-10-14","fair_rate_basis":"$2.40/m³ (BBC OwnerAdj idx=8 Rate)","est_missing":194.4,"reason":"Hauling Raml Bab Thani from WTC to BBConstruction: BBC OwnerAdj idx=8 ($2.40/m³) expired and TrucksAdj kept Owner='wtc' (3 trips = $0; $194.40 at $2.40/m³).","invoices":"36185, 36187, 36192","all_invoices":"36185, 36187, 36192"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb9","counterparty":"Aljawad","site":"Al Jawad","product":"Ramel Mrml","zero_trips":1,"total_route_trips":1,"ot_trips":0,"zero_vol":27,"dates":"2026-09-14 to 2026-09-14","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":50,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction OwnerAdj has no rule for Aljawad (1 trips of Ramel Mrml = $0; benchmark $50.00 at $50/trip).","invoices":"36155","all_invoices":"36155"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Sabeh Beton","site":"Choueifat","product":"Jarousha","zero_trips":33,"total_route_trips":33,"ot_trips":0,"zero_vol":957,"dates":"2026-08-26 to 2026-10-23","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":3828,"reason":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) TransAdj split on BBConstruction.","invoices":"1634, 1648, 1664, 1667, 1678, 1681, 1694, 1705, 1711, 1730, 1758, 1772 (+21 more)","all_invoices":"1634, 1648, 1664, 1667, 1678, 1681, 1694, 1705, 1711, 1730, 1758, 1772, 1794, 1807, 1817, 1831, 1846, 1871, 1877, 1903, 1909, 1914, 1919, 1933, 1950, 1960, 1988, 2010, 2037, 2048, 2059, 2069, 2085"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Sabeh Beton","site":"Choueifat","product":"sarek","zero_trips":6,"total_route_trips":6,"ot_trips":0,"zero_vol":228.18,"dates":"2026-09-23 to 2026-10-17","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":912.72,"reason":"Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$152/trip) TransAdj split on BBConstruction.","invoices":"11466, 11519, 11564, 11714, 11733, 11746","all_invoices":"11466, 11519, 11564, 11714, 11733, 11746"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Sabeh Beton","site":"Nahr El-Mot","product":"Jarousha","zero_trips":1,"total_route_trips":1,"ot_trips":0,"zero_vol":29,"dates":"2026-09-15 to 2026-09-15","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":116,"reason":"Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) TransAdj split on BBConstruction.","invoices":"1784","all_invoices":"1784"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Sabeh Beton","site":"Choueifat","product":"Jarousha","zero_trips":45,"total_route_trips":45,"ot_trips":0,"zero_vol":1285,"dates":"2026-08-26 to 2026-10-20","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":5140,"reason":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$114/trip) TransAdj split on BBConstruction.","invoices":"1639, 1655, 1659, 1665, 1671, 1684, 1693, 1707, 1714, 1723, 1751, 1756 (+33 more)","all_invoices":"1639, 1655, 1659, 1665, 1671, 1684, 1693, 1707, 1714, 1723, 1751, 1756, 1760, 1761, 1773, 1802, 1806, 1818, 1834, 1851, 1878, 1881, 1884, 1893, 1899, 1906, 1918, 1921, 1927, 1929, 1937, 1939, 1943, 1966, 1968, 1973, 1976, 1981, 1992, 2013, 2026, 2035, 2038, 2046, 2063"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Sabeh Beton","site":"Choueifat","product":"sarek","zero_trips":4,"total_route_trips":4,"ot_trips":0,"zero_vol":149.88,"dates":"2026-09-24 to 2026-10-17","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":599.52,"reason":"Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$150/trip) TransAdj split on BBConstruction.","invoices":"11484, 11602, 11737, 11752","all_invoices":"11484, 11602, 11737, 11752"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Sabeh Beton","site":"Nahr El-Mot","product":"Jarousha","zero_trips":2,"total_route_trips":2,"ot_trips":0,"zero_vol":56,"dates":"2026-09-14 to 2026-09-15","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":224,"reason":"Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$112/trip) TransAdj split on BBConstruction.","invoices":"1783, 1791","all_invoices":"1783, 1791"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"Tb9","counterparty":"Sabeh Beton","site":"Choueifat","product":"Jarousha","zero_trips":5,"total_route_trips":5,"ot_trips":0,"zero_vol":135,"dates":"2026-08-28 to 2026-10-13","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":540,"reason":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$108/trip) TransAdj split on BBConstruction.","invoices":"1662, 1666, 1759, 1972, 2019","all_invoices":"1662, 1666, 1759, 1972, 2019"}],"truck_expenses":[{"truck":"TB1","co":"WTC","date":"2026-08-03","after_cutover":false,"idx":3999,"invoice":"20","supplier":"KORRI AUTO S.A.L","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":471.75,"usd":471.75,"notes":"","inv":"20","sub":"Maintenance","unit_cost":471.75,"total":471.75,"is_post":false},{"truck":"TB1","co":"WTC","date":"2026-08-03","after_cutover":false,"idx":4000,"invoice":"9","supplier":"KORRI AUTO S.A.L","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":122.1,"usd":122.1,"notes":"","inv":"9","sub":"Maintenance","unit_cost":122.1,"total":122.1,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-08","after_cutover":false,"idx":4026,"invoice":"88","supplier":"Hshaysho","cat":"Repairs & Maintenance","subcat":"maintenance","is_fuel":false,"qty":1,"price":962,"usd":962,"notes":"","inv":"88","sub":"maintenance","unit_cost":962,"total":962,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-11","after_cutover":false,"idx":4035,"invoice":"7513","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":40,"usd":40,"notes":"","inv":"7513","sub":"Maintenance","unit_cost":40,"total":40,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-11","after_cutover":false,"idx":4039,"invoice":"7761","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":50,"usd":50,"notes":"","inv":"7761","sub":"Maintenance","unit_cost":50,"total":50,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-12","after_cutover":false,"idx":4047,"invoice":"1742","supplier":"ziadeh","cat":"Repairs & Maintenance","subcat":"maintenance","is_fuel":false,"qty":1,"price":115,"usd":115,"notes":"","inv":"1742","sub":"maintenance","unit_cost":115,"total":115,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-12","after_cutover":false,"idx":4048,"invoice":"1791","supplier":"ziadeh","cat":"Repairs & Maintenance","subcat":"maintenance","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"1791","sub":"maintenance","unit_cost":60,"total":60,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-12","after_cutover":false,"idx":4049,"invoice":"1758","supplier":"ziadeh","cat":"Repairs & Maintenance","subcat":"Battery","is_fuel":false,"qty":1,"price":470,"usd":470,"notes":"","inv":"1758","sub":"Battery","unit_cost":470,"total":470,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-12","after_cutover":false,"idx":4051,"invoice":"1784","supplier":"ziadeh","cat":"Repairs & Maintenance","subcat":"Wheel","is_fuel":false,"qty":1,"price":430,"usd":430,"notes":"","inv":"1784","sub":"Wheel","unit_cost":430,"total":430,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-14","after_cutover":false,"idx":4065,"invoice":"","supplier":"Harbi","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":1400,"usd":1400,"notes":"","inv":"","sub":"Maintenance","unit_cost":1400,"total":1400,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-15","after_cutover":false,"idx":4068,"invoice":"10533","supplier":"Mazen Abo Hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":30,"usd":30,"notes":"","inv":"10533","sub":"Maintenance","unit_cost":30,"total":30,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-15","after_cutover":false,"idx":4069,"invoice":"10534","supplier":"Mazen Abo Hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":194,"usd":194,"notes":"","inv":"10534","sub":"Maintenance","unit_cost":194,"total":194,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-15","after_cutover":false,"idx":4079,"invoice":"","supplier":"Hashesho","cat":"Repairs & Maintenance","subcat":"electrical","is_fuel":false,"qty":1,"price":315,"usd":315,"notes":"","inv":"","sub":"electrical","unit_cost":315,"total":315,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-19","after_cutover":false,"idx":4073,"invoice":"","supplier":"ADMOUN MARTINE","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":47,"usd":47,"notes":"","inv":"","sub":"Maintenance","unit_cost":47,"total":47,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-19","after_cutover":false,"idx":4096,"invoice":"20664","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":276,"price":1.24,"usd":342.24,"notes":"","inv":"20664","sub":"diesel","unit_cost":1.24,"total":342.24,"is_post":false},{"truck":"TB1","co":"WTC","date":"2026-08-20","after_cutover":false,"idx":4109,"invoice":"6847","supplier":"atwi","cat":"Parts","subcat":"tube","is_fuel":false,"qty":1,"price":40,"usd":40,"notes":"","inv":"6847","sub":"tube","unit_cost":40,"total":40,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-22","after_cutover":false,"idx":4126,"invoice":"62","supplier":"Hshaysho","cat":"Repairs & Maintenance","subcat":"maintenance","is_fuel":false,"qty":1,"price":315,"usd":315,"notes":"","inv":"62","sub":"maintenance","unit_cost":315,"total":315,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-29","after_cutover":true,"idx":4149,"invoice":"8752","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":40,"usd":40,"notes":"","inv":"8752","sub":"Maintenance","unit_cost":40,"total":40,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-08-29","after_cutover":true,"idx":4155,"invoice":"7916","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"WASH","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"7916","sub":"WASH","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-08-29","after_cutover":true,"idx":4156,"invoice":"7406","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":125,"usd":125,"notes":"","inv":"7406","sub":"Maintenance","unit_cost":125,"total":125,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-01","after_cutover":true,"idx":4162,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":74,"price":1.35,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.35,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-03","after_cutover":true,"idx":4183,"invoice":"15522","supplier":"Mazen Abo Hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":48,"usd":48,"notes":"","inv":"15522","sub":"Maintenance","unit_cost":48,"total":48,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-04","after_cutover":true,"idx":4184,"invoice":"435","supplier":"Star Solutions","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":394.05,"usd":394.05,"notes":"","inv":"435","sub":"Maintenance","unit_cost":394.05,"total":394.05,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-04","after_cutover":true,"idx":4185,"invoice":"443","supplier":"Star Solutions","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":233.1,"usd":233.1,"notes":"","inv":"443","sub":"Maintenance","unit_cost":233.1,"total":233.1,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-04","after_cutover":true,"idx":4186,"invoice":"449","supplier":"Star Solutions","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":389.61,"usd":389.61,"notes":"","inv":"449","sub":"Maintenance","unit_cost":389.61,"total":389.61,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-05","after_cutover":true,"idx":4198,"invoice":"","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.28,"usd":256,"notes":"","inv":"","sub":"diesel","unit_cost":1.28,"total":256,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-05","after_cutover":true,"idx":4199,"invoice":"","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.28,"usd":256,"notes":"","inv":"","sub":"diesel","unit_cost":1.28,"total":256,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-10","after_cutover":true,"idx":4219,"invoice":"","supplier":"mohamad habib","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":50,"usd":50,"notes":"","inv":"","sub":"Maintenance","unit_cost":50,"total":50,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-11","after_cutover":true,"idx":4221,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":77,"price":1.3,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.3,"total":100,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-11","after_cutover":true,"idx":4222,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":77,"price":1.3,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.3,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4220,"invoice":"","supplier":"najm","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":50,"usd":50,"notes":"","inv":"","sub":"Maintenance","unit_cost":50,"total":50,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4225,"invoice":"10213","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"10213","sub":"Maintenance","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4226,"invoice":"9288","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":80,"usd":80,"notes":"","inv":"9288","sub":"Maintenance","unit_cost":80,"total":80,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4227,"invoice":"9154","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":35,"usd":35,"notes":"","inv":"9154","sub":"Maintenance","unit_cost":35,"total":35,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4236,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":77,"price":1.3,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.3,"total":100,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4238,"invoice":"20806","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":220,"price":1.3,"usd":286,"notes":"","inv":"20806","sub":"diesel","unit_cost":1.3,"total":286,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4246,"invoice":"20816","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.33,"usd":266,"notes":"","inv":"20816","sub":"diesel","unit_cost":1.33,"total":266,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4247,"invoice":"20817","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.33,"usd":266,"notes":"","inv":"20817","sub":"diesel","unit_cost":1.33,"total":266,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4248,"invoice":"20818","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":305,"price":1.33,"usd":405.65,"notes":"","inv":"20818","sub":"diesel","unit_cost":1.33,"total":405.65,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4249,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":77,"price":1.3,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.3,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4259,"invoice":"7026","supplier":"Ali Salman","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":30,"usd":30,"notes":"","inv":"7026","sub":"Maintenance","unit_cost":30,"total":30,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4260,"invoice":"7023","supplier":"Ali Salman","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":150,"usd":150,"notes":"","inv":"7023","sub":"Maintenance","unit_cost":150,"total":150,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4262,"invoice":"7029","supplier":"Ali Salman","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":100,"usd":100,"notes":"","inv":"7029","sub":"Maintenance","unit_cost":100,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-17","after_cutover":true,"idx":4268,"invoice":"20836","supplier":"BBConstruction","cat":"Fuel","subcat":"Diesel","is_fuel":true,"qty":200,"price":1.38,"usd":276,"notes":"","inv":"20836","sub":"Diesel","unit_cost":1.38,"total":276,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-17","after_cutover":true,"idx":4272,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":73,"price":1.38,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.38,"total":100,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-18","after_cutover":true,"idx":4273,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":73,"price":1.38,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.38,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-18","after_cutover":true,"idx":4281,"invoice":"2174","supplier":"ziadeh","cat":"Repairs & Maintenance","subcat":"Wheel","is_fuel":false,"qty":1,"price":830,"usd":830,"notes":"","inv":"2174","sub":"Wheel","unit_cost":830,"total":830,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-19","after_cutover":true,"idx":4285,"invoice":"9056","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"WASH","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"9056","sub":"WASH","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-19","after_cutover":true,"idx":4286,"invoice":"9069","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"tube","is_fuel":false,"qty":1,"price":75,"usd":75,"notes":"","inv":"9069","sub":"tube","unit_cost":75,"total":75,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-19","after_cutover":true,"idx":4288,"invoice":"10597","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":144,"usd":144,"notes":"","inv":"10597","sub":"Maintenance","unit_cost":144,"total":144,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4311,"invoice":"20857","supplier":"BBConstruction","cat":"Fuel","subcat":"Diesel","is_fuel":true,"qty":100,"price":1.49,"usd":149,"notes":"","inv":"20857","sub":"Diesel","unit_cost":1.49,"total":149,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4313,"invoice":"20859","supplier":"BBConstruction","cat":"Fuel","subcat":"Diesel","is_fuel":true,"qty":100,"price":1.49,"usd":149,"notes":"","inv":"20859","sub":"Diesel","unit_cost":1.49,"total":149,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4317,"invoice":"","supplier":"Al kawthar","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"","sub":"Maintenance","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4319,"invoice":"7032","supplier":"ali salman","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":200,"usd":200,"notes":"","inv":"7032","sub":"Maintenance","unit_cost":200,"total":200,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4320,"invoice":"7035","supplier":"ali salman","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":125,"usd":125,"notes":"","inv":"7035","sub":"Maintenance","unit_cost":125,"total":125,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4322,"invoice":"5903","supplier":"mazen abo hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":100,"usd":100,"notes":"","inv":"5903","sub":"Maintenance","unit_cost":100,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-28","after_cutover":true,"idx":4337,"invoice":"5907","supplier":"Mazen Abo Hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":250,"usd":250,"notes":"","inv":"5907","sub":"Maintenance","unit_cost":250,"total":250,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-28","after_cutover":true,"idx":4342,"invoice":"","supplier":"FUEL STATION","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":64,"price":1.5625,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.5625,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-01","after_cutover":true,"idx":4357,"invoice":"20866","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":240,"price":1.46,"usd":350.4,"notes":"","inv":"20866","sub":"diesel","unit_cost":1.46,"total":350.4,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-01","after_cutover":true,"idx":4358,"invoice":"20868","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.46,"usd":292,"notes":"","inv":"20868","sub":"diesel","unit_cost":1.46,"total":292,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-03","after_cutover":true,"idx":4371,"invoice":"","supplier":"najm","cat":"Parts","subcat":"Maintenance","is_fuel":false,"qty":2,"price":200,"usd":400,"notes":"","inv":"","sub":"Maintenance","unit_cost":200,"total":400,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-03","after_cutover":true,"idx":4372,"invoice":"","supplier":"Hashesho","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":400,"usd":400,"notes":"","inv":"","sub":"Maintenance","unit_cost":400,"total":400,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-03","after_cutover":true,"idx":4373,"invoice":"4","supplier":"ismail hadad","cat":"Repairs & Maintenance","subcat":"maintenance","is_fuel":false,"qty":1,"price":275,"usd":250,"notes":"","inv":"4","sub":"maintenance","unit_cost":275,"total":250,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-10-05","after_cutover":true,"idx":4379,"invoice":"11056","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"WASH","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"11056","sub":"WASH","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-09","after_cutover":true,"idx":4425,"invoice":"","supplier":"bbconstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.42,"usd":284,"notes":"","inv":"","sub":"diesel","unit_cost":1.42,"total":284,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-09","after_cutover":true,"idx":4427,"invoice":"5921","supplier":"mazen abo hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":49,"usd":49,"notes":"","inv":"5921","sub":"Maintenance","unit_cost":49,"total":49,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-10-10","after_cutover":true,"idx":4435,"invoice":"22425","supplier":"NAJM","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":50,"usd":50,"notes":"","inv":"22425","sub":"Maintenance","unit_cost":50,"total":50,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-12","after_cutover":true,"idx":4440,"invoice":"","supplier":"ahmad ibrahim","cat":"Parts","subcat":"tube","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"","sub":"tube","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-13","after_cutover":true,"idx":4448,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":68,"price":1.48,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.48,"total":100,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-13","after_cutover":true,"idx":4454,"invoice":"","supplier":"bbconstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":150,"price":1.37,"usd":205.5,"notes":"","inv":"","sub":"diesel","unit_cost":1.37,"total":205.5,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-15","after_cutover":true,"idx":4462,"invoice":"20978","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.36,"usd":272,"notes":"","inv":"20978","sub":"diesel","unit_cost":1.36,"total":272,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-15","after_cutover":true,"idx":4465,"invoice":"20987","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":100,"price":1.36,"usd":136,"notes":"","inv":"20987","sub":"diesel","unit_cost":1.36,"total":136,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-17","after_cutover":true,"idx":2478,"invoice":"1717","supplier":"charif al kasem","cat":"Repairs & Maintenance","subcat":"march","is_fuel":false,"qty":1,"price":150,"usd":150,"notes":"","inv":"1717","sub":"march","unit_cost":150,"total":150,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-17","after_cutover":true,"idx":4478,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":73,"price":1.38,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.38,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-20","after_cutover":true,"idx":4491,"invoice":"","supplier":"ALIG","cat":"Insurance - Auto/Property","subcat":"Insurance","is_fuel":false,"qty":1,"price":525,"usd":525,"notes":"","inv":"","sub":"Insurance","unit_cost":525,"total":525,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-20","after_cutover":true,"idx":4498,"invoice":"39156","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.36,"usd":272,"notes":"","inv":"39156","sub":"diesel","unit_cost":1.36,"total":272,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-10-21","after_cutover":true,"idx":4515,"invoice":"42","supplier":"KORRI AUTO S.A.L","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":800.98,"usd":800.98,"notes":"","inv":"42","sub":"Maintenance","unit_cost":800.98,"total":800.98,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-21","after_cutover":true,"idx":4518,"invoice":"56","supplier":"KORRI AUTO S.A.L","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":321.9,"usd":321.9,"notes":"","inv":"56","sub":"Maintenance","unit_cost":321.9,"total":321.9,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-10-22","after_cutover":true,"idx":4525,"invoice":"12182","supplier":"imad ismael","cat":"Repairs & Maintenance","subcat":"تركيب جواني (Inner Seal Install)","is_fuel":false,"qty":1,"price":70,"usd":70,"notes":"","inv":"12182","sub":"تركيب جواني (Inner Seal Install)","unit_cost":70,"total":70,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-22","after_cutover":true,"idx":4527,"invoice":"12614","supplier":"imad ismael","cat":"Repairs & Maintenance","subcat":"wheel","is_fuel":false,"qty":1,"price":50,"usd":50,"notes":"","inv":"12614","sub":"wheel","unit_cost":50,"total":50,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-22","after_cutover":true,"idx":4528,"invoice":"12664","supplier":"imad ismael","cat":"Repairs & Maintenance","subcat":"تركيب جواني (Inner Seal Install)","is_fuel":false,"qty":1,"price":80,"usd":80,"notes":"","inv":"12664","sub":"تركيب جواني (Inner Seal Install)","unit_cost":80,"total":80,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-23","after_cutover":true,"idx":4534,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":35,"price":1.43,"usd":50,"notes":"","inv":"","sub":"diesel","unit_cost":1.43,"total":50,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-23","after_cutover":true,"idx":4536,"invoice":"15543","supplier":"Mazen Abo Hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":160,"usd":160,"notes":"","inv":"15543","sub":"Maintenance","unit_cost":160,"total":160,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-10-23","after_cutover":true,"idx":4537,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":70,"price":1.43,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.43,"total":100,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-23","after_cutover":true,"idx":4538,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":70,"price":1.43,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.43,"total":100,"is_post":true}],"ot_list":[{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7570,"invoice":"6372","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"6372","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7572,"invoice":"6374","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"6374","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7574,"invoice":"18976","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"18976","vol":29,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7576,"invoice":"18978","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18978","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7571,"invoice":"6373","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"6373","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7573,"invoice":"6375","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"6375","vol":28,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7575,"invoice":"18977","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"18977","vol":28,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-01","idx":7583,"invoice":"18996","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18996","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-01","idx":7585,"invoice":"18998","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18998","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-01","idx":7582,"invoice":"18995","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18995","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-02","idx":7588,"invoice":"18702","driver":"Ali Saleh","counterparty":"SOIME choueifat","site":"SOIME choueifat / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":52.785,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18702","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-03","idx":7592,"invoice":"18716","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18716","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-03","idx":7593,"invoice":"18717","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18717","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-03","idx":7598,"invoice":"18676","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18676","vol":28,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-03","idx":7595,"invoice":"18719","driver":"Ali Saleh","counterparty":"soime dawra","site":"soime dawra / dawra","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":80.5875,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18719","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-03","idx":7599,"invoice":"18678","driver":"Ali Saleh","counterparty":"soime dawra","site":"soime dawra / dawra","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":80.15875,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18678","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7604,"invoice":"18686","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18686","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7606,"invoice":"18688","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18688","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7601,"invoice":"18683","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18683","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7602,"invoice":"18684","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18684","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7607,"invoice":"18728","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18728","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7609,"invoice":"18733","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18733","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-05","idx":7611,"invoice":"18745","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18745","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-05","idx":7615,"invoice":"18749","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18749","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-08","idx":7618,"invoice":"15506","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15506","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7630,"invoice":"18955","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18955","vol":29,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7621,"invoice":"15511","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"15511","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7622,"invoice":"15512","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"15512","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7623,"invoice":"15513","driver":"Ali Saleh","counterparty":"safara","site":"safara / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":54,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"15513","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7628,"invoice":"18952","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18952","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7632,"invoice":"18957","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18957","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7636,"invoice":"18902","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18902","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7641,"invoice":"18908","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18908","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7642,"invoice":"18910","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18910","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7639,"invoice":"18906","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18906","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7643,"invoice":"18911","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18911","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7646,"invoice":"18914","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18914","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7649,"invoice":"18917","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18917","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7638,"invoice":"18905","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18905","vol":27,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-11","idx":7669,"invoice":"18946","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18946","vol":28,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-11","idx":7663,"invoice":"18939","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18939","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-12","idx":7672,"invoice":"18864","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18864","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-12","idx":7674,"invoice":"18866","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18866","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-12","idx":7677,"invoice":"18869","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18869","vol":29,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-12","idx":7675,"invoice":"18867","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18867","vol":28,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-13","idx":7680,"invoice":"18872","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18872","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-13","idx":7679,"invoice":"18871","driver":"Mohamad Habib","counterparty":"majbal rayan","site":"majbal rayan / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":56,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18871","vol":28,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-14","idx":7698,"invoice":"18763","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18763","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-14","idx":7702,"invoice":"18769","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18769","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-14","idx":7687,"invoice":"18755","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18755","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-14","idx":7683,"invoice":"18751","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18751","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-14","idx":7685,"invoice":"18753","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18753","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-15","idx":7711,"invoice":"18885","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18885","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7714,"invoice":"18889","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18889","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7722,"invoice":"18900","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18900","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7725,"invoice":"18779","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18779","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7721,"invoice":"18899","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18899","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7724,"invoice":"18778","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18778","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7726,"invoice":"18780","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18780","vol":27,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7736,"invoice":"18827","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18827","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7739,"invoice":"18831","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18831","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7737,"invoice":"18829","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18829","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7740,"invoice":"18832","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18832","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7732,"invoice":"18797","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18797","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7734,"invoice":"18800","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18800","vol":27,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-20","idx":7756,"invoice":"18815","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18815","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-20","idx":7754,"invoice":"18813","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18813","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-20","idx":7755,"invoice":"18814","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18814","vol":27,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-21","idx":7761,"invoice":"15387","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15387","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-21","idx":7758,"invoice":"18817","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18817","vol":28,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-22","idx":7770,"invoice":"15162","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15162","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-22","idx":7772,"invoice":"15164","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15164","vol":29,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-22","idx":7769,"invoice":"15160","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Kasara","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15160","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-22","idx":7771,"invoice":"15163","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15163","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-23","idx":7776,"invoice":"15126","driver":"Ali Saleh","counterparty":"majbal rayan","site":"majbal rayan / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":54,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"15126","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-23","idx":7778,"invoice":"15129","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15129","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-23","idx":7779,"invoice":"15130","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15130","vol":27,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-26","idx":7795,"invoice":"15416","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"15416","vol":28,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-26","idx":7801,"invoice":"15079","driver":"Mohamad Habib","counterparty":"haj ibrahim","site":"haj ibrahim / afak","region":"Unspecified","product":"Mghasal","qty":28,"trans_rev":56,"ot_rate_sp":0,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"15079","vol":28,"ot_allow":0},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-26","idx":7802,"invoice":"15080","driver":"Mohamad Habib","counterparty":"haj ibrahim","site":"haj ibrahim / afak","region":"Unspecified","product":"Mghasal","qty":28,"trans_rev":56,"ot_rate_sp":0,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"15080","vol":28,"ot_allow":0},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-27","idx":7803,"invoice":"15081","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"15081","vol":28,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-28","idx":7819,"invoice":"19035","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19035","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-28","idx":7817,"invoice":"19033","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19033","vol":28,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-29","idx":7828,"invoice":"15184","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15184","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-29","idx":7822,"invoice":"19038","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"19038","vol":28,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19556,"invoice":"6402","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6402","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19558,"invoice":"6404","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6404","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19559,"invoice":"6405","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6405","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19561,"invoice":"6407","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6407","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19562,"invoice":"6408","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6408","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19573,"invoice":"6419","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6419","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19576,"invoice":"6422","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6422","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19578,"invoice":"6424","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6424","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19565,"invoice":"6411","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6411","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19567,"invoice":"6413","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6413","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19568,"invoice":"6414","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6414","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19570,"invoice":"6416","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6416","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19572,"invoice":"6418","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6418","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19579,"invoice":"6425","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6425","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19563,"invoice":"6409","driver":"Ali Saleh","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":27,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6409","vol":27,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-02","idx":19580,"invoice":"15276","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15276","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-02","idx":19582,"invoice":"15278","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15278","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-02","idx":19585,"invoice":"15281","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15281","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-02","idx":19586,"invoice":"15282","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15282","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-02","idx":7855,"invoice":"15273","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15273","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-02","idx":7856,"invoice":"15275","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15275","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-05","idx":7870,"invoice":"15310","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15310","vol":29,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-07","idx":7891,"invoice":"19458","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19458","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-07","idx":7892,"invoice":"19459","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19459","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-08","idx":7899,"invoice":"19518","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19518","vol":27,"ot_allow":7},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19720,"invoice":"15287","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15287","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19722,"invoice":"15289","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15289","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19726,"invoice":"15293","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15293","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19727,"invoice":"15294","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15294","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19728,"invoice":"15295","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15295","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19716,"invoice":"15283","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15283","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19717,"invoice":"15284","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15284","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19718,"invoice":"15285","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15285","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19719,"invoice":"15286","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15286","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19725,"invoice":"15292","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15292","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19730,"invoice":"15297","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15297","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19731,"invoice":"15298","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15298","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19733,"invoice":"15300","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15300","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19757,"invoice":"19476","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19476","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19771,"invoice":"19483","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19483","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19774,"invoice":"19486","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19486","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19787,"invoice":"19490","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19490","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19797,"invoice":"19500","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19500","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19758,"invoice":"19477","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19477","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19769,"invoice":"19481","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19481","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19770,"invoice":"19482","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19482","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19772,"invoice":"19484","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19484","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19773,"invoice":"19485","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19485","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19789,"invoice":"19492","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19492","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19791,"invoice":"19494","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19494","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19792,"invoice":"19495","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19495","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19794,"invoice":"19497","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19497","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19795,"invoice":"19498","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19498","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19796,"invoice":"19499","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19499","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-12","idx":7935,"invoice":"11705","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / choueifat","region":"Beirut","product":"Kasara","qty":29,"trans_rev":58,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"11705","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-12","idx":7937,"invoice":"11707","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / choueifat","region":"Beirut","product":"Kasara","qty":29,"trans_rev":58,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"11707","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-14","idx":7948,"invoice":"11713","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":58,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"11713","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-14","idx":7949,"invoice":"11714","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / choueifat","region":"Beirut","product":"Kasara","qty":29,"trans_rev":58,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"11714","vol":29,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-16","idx":7965,"invoice":"19367","driver":"Ali Saleh","counterparty":"soime choueifat","site":"soime choueifat / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":55.05625,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"19367","vol":27,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-10-17","idx":7977,"invoice":"11728","driver":"Ahmad Hamoud","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / Gisr al bacha","region":"Excluded","product":"Mghasal","qty":29,"trans_rev":58,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"11728","vol":29,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-17","idx":7976,"invoice":"11727","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / Gisr al bacha","region":"Excluded","product":"Mghasal","qty":29,"trans_rev":58,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"11727","vol":29,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-17","idx":7979,"invoice":"11730","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":58,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"11730","vol":29,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-21","idx":8010,"invoice":"19807","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Kasara","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19807","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-22","idx":8017,"invoice":"19906","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Kasara","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"19906","vol":27,"ot_allow":7},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19928,"invoice":"19252","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19252","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19929,"invoice":"19253","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19253","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19930,"invoice":"19254","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19254","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19934,"invoice":"19258","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19258","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19947,"invoice":"19272","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19272","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19951,"invoice":"19101","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19101","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19958,"invoice":"19108","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19108","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19964,"invoice":"19114","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19114","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19975,"invoice":"19125","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19125","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19927,"invoice":"19251","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19251","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19936,"invoice":"19260","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19260","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19938,"invoice":"19262","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19262","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19939,"invoice":"19263","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19263","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19940,"invoice":"19264","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19264","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19941,"invoice":"19265","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19265","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19942,"invoice":"19266","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19266","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19959,"invoice":"19109","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19109","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19962,"invoice":"19112","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19112","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19963,"invoice":"19113","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19113","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19966,"invoice":"19116","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19116","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19968,"invoice":"19118","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19118","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19969,"invoice":"19119","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19119","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19973,"invoice":"19123","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19123","vol":29,"ot_allow":10}]};

  const state = {
    scope: 'cutover', // 'cutover' | 'live'
    mode: 'recorded', // 'recorded' | 'strict' | 'full'
    tab: 'pnl',       // 'pnl' | 'zero' | 'routes' | 'expenses' | 'overtime' | 'recon'
    zeroSearch: '',
    zeroTruck: 'ALL',
    zeroCompany: 'ALL',
    zeroStream: 'ALL',
    routeSearch: '',
    routeStream: 'ALL',
    routeTruck: 'ALL',
    routeCompany: 'ALL',
    routePricing: 'ALL',
    expSearch: '',
    expTruck: 'ALL',
    expCat: 'ALL',
    otSearch: '',
    otTruck: 'ALL',
    otDriver: 'ALL'
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtUSD(n, decimals = 2) {
    const v = Number(n) || 0;
    const abs = Math.abs(v).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    return (v < 0 ? '-$' : '$') + abs;
  }

  function fmtSignedUSD(n, decimals = 2) {
    const v = Number(n) || 0;
    const abs = Math.abs(v).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    return (v >= 0 ? '+$' : '-$') + abs;
  }

  function fmtNum(n, decimals = 1) {
    const v = Number(n) || 0;
    return v.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function fmtInt(n) {
    return Math.round(Number(n) || 0).toLocaleString('en-US');
  }

  const CUTOVER_PNL_MODES = {
    recorded: {
      key: 'recorded',
      label: '1. Recorded Ledger P&L',
      badge: '$46,124 Rev | Net +$1,746 (3.8%)',
      totalTrips: 999,
      wtcTrips: 748,
      bbcTrips: 251,
      totalVol: 28440.2,
      wtcVol: 21172.0,
      bbcVol: 7268.2,
      transRev: 46124.02,
      revSub: 'Sales Delivery: $21,314.02 | Raw Material Haulage: $24,810.00 (734 paid trips)',
      totalCost: 44378.48,
      costPerTrip: 44.42,
      costPerM3: 1.56,
      netProfit: 1745.54,
      marginPct: '3.8%',
      netPerTrip: 1.75,
      zeroTrips: 265,
      zeroSub: '26.5% of fleet trips booked at $0.00 (135 Sales + 130 Raw Material)',
      trucks: {
        TB1: {
          code: 'TB1', plate: '360676', owner: 'Karim Bdeir', driver: 'Majed Karam (to Oct 15) / Ahmad Hamoud (from Oct 16)',
          trips: 365, paidTrips: 251, zeroTrips: 114, vol: 9693.7,
          salesTrips: 175, salesPaid: 95, salesZero: 80, salesRev: 10945.00,
          rawTrips: 190, rawPaid: 156, rawZero: 34, rawRev: 8742.00,
          adjRev: 0, totalRev: 19687.00,
          dieselL: 8172, dieselCost: 11297.27, lubes: 255.00, repairs: 2300.00, insurance: 547.95, driverPay: 2504.67,
          totalCost: 16904.89, netProfit: 2782.11, marginPct: '+14.1%', statusClass: 'em'
        },
        Tb7: {
          code: 'Tb7', plate: '364656', owner: 'Hussein Bdeir', driver: 'Mohamad Habib (Full 2-Month Period)',
          trips: 282, paidTrips: 205, zeroTrips: 77, vol: 7928.5,
          salesTrips: 90, salesPaid: 66, salesZero: 24, salesRev: 4305.51,
          rawTrips: 192, rawPaid: 139, rawZero: 53, rawRev: 7660.00,
          adjRev: 0, totalRev: 11965.51,
          dieselL: 6534, dieselCost: 9062.08, lubes: 160.00, repairs: 1323.00, insurance: 0.00, driverPay: 2796.99,
          totalCost: 13342.07, netProfit: -1376.56, marginPct: '-11.5%', statusClass: 'cr'
        },
        Tb9: {
          code: 'Tb9', plate: '364168', owner: 'Jad Bdeir', driver: 'Ali Saleh (Full 2-Month Period)',
          trips: 352, paidTrips: 278, zeroTrips: 74, vol: 10818.0,
          salesTrips: 114, salesPaid: 83, salesZero: 31, salesRev: 6063.51,
          rawTrips: 238, rawPaid: 195, rawZero: 43, rawRev: 8408.00,
          adjRev: 0, totalRev: 14471.51,
          dieselL: 6563, dieselCost: 9057.83, lubes: 275.00, repairs: 2604.69, insurance: 0.00, driverPay: 2194.00,
          totalCost: 14131.52, netProfit: 339.99, marginPct: '+2.3%', statusClass: 'am'
        }
      }
    },
    strict: {
      key: 'strict',
      label: '2. Strict Adjusted P&L (+$16,896)',
      badge: '$63,020 Rev | Net +$18,642 (29.6%)',
      totalTrips: 999,
      wtcTrips: 748,
      bbcTrips: 251,
      totalVol: 28440.2,
      wtcVol: 21172.0,
      bbcVol: 7268.2,
      transRev: 63020.42,
      revSub: 'Recorded $46,124.02 + $16,896.40 Strict Unbundled & Missing-Rate Recovery (165 trips)',
      totalCost: 44378.48,
      costPerTrip: 44.42,
      costPerM3: 1.56,
      netProfit: 18641.94,
      marginPct: '29.6%',
      netPerTrip: 18.66,
      zeroTrips: 100,
      zeroSub: '165 external/partner $0 trips recovered (+$16,896.40); 100 internal quarry/inter-plant kept at $0',
      trucks: {
        TB1: {
          code: 'TB1', plate: '360676', owner: 'Karim Bdeir', driver: 'Majed Karam (to Oct 15) / Ahmad Hamoud (from Oct 16)',
          trips: 365, paidTrips: 344, zeroTrips: 21, vol: 9693.7,
          salesTrips: 175, salesPaid: 175, salesZero: 0, salesRev: 10945.00,
          rawTrips: 190, rawPaid: 169, rawZero: 21, rawRev: 8742.00,
          adjRev: 9590.80, totalRev: 29277.80,
          dieselL: 8172, dieselCost: 11297.27, lubes: 255.00, repairs: 2300.00, insurance: 547.95, driverPay: 2504.67,
          totalCost: 16904.89, netProfit: 12372.91, marginPct: '+42.3%', statusClass: 'em'
        },
        Tb7: {
          code: 'Tb7', plate: '364656', owner: 'Hussein Bdeir', driver: 'Mohamad Habib (Full 2-Month Period)',
          trips: 282, paidTrips: 241, zeroTrips: 41, vol: 7928.5,
          salesTrips: 90, salesPaid: 90, salesZero: 0, salesRev: 4305.51,
          rawTrips: 192, rawPaid: 151, rawZero: 41, rawRev: 7660.00,
          adjRev: 3538.40, totalRev: 15503.91,
          dieselL: 6534, dieselCost: 9062.08, lubes: 160.00, repairs: 1323.00, insurance: 0.00, driverPay: 2796.99,
          totalCost: 13342.07, netProfit: 2161.84, marginPct: '+13.9%', statusClass: 'em'
        },
        Tb9: {
          code: 'Tb9', plate: '364168', owner: 'Jad Bdeir', driver: 'Ali Saleh (Full 2-Month Period)',
          trips: 352, paidTrips: 314, zeroTrips: 38, vol: 10818.0,
          salesTrips: 114, salesPaid: 114, salesZero: 0, salesRev: 6063.51,
          rawTrips: 238, rawPaid: 200, rawZero: 38, rawRev: 8408.00,
          adjRev: 3767.20, totalRev: 18238.71,
          dieselL: 6563, dieselCost: 9057.83, lubes: 275.00, repairs: 2604.69, insurance: 0.00, driverPay: 2194.00,
          totalCost: 14131.52, netProfit: 4107.19, marginPct: '+22.5%', statusClass: 'em'
        }
      }
    },
    full: {
      key: 'full',
      label: '3. Full Commercial Benchmark P&L (+$22,828)',
      badge: '$68,952 Rev | Net +$24,574 (35.6%)',
      totalTrips: 999,
      wtcTrips: 748,
      bbcTrips: 251,
      totalVol: 28440.2,
      wtcVol: 21172.0,
      bbcVol: 7268.2,
      transRev: 68952.42,
      revSub: 'Recorded $46,124.02 + $22,828.40 Full Commercial Credit Across All 265 $0 Trips',
      totalCost: 44378.48,
      costPerTrip: 44.42,
      costPerM3: 1.56,
      netProfit: 24573.94,
      marginPct: '35.6%',
      netPerTrip: 24.60,
      zeroTrips: 0,
      zeroSub: 'All 265 $0.00 trips credited at commercial haulage rates (+$11,360.40 Sales + $11,468.00 Raw)',
      trucks: {
        TB1: {
          code: 'TB1', plate: '360676', owner: 'Karim Bdeir', driver: 'Majed Karam (to Oct 15) / Ahmad Hamoud (from Oct 16)',
          trips: 365, paidTrips: 365, zeroTrips: 0, vol: 9693.7,
          salesTrips: 175, salesPaid: 175, salesZero: 0, salesRev: 10945.00,
          rawTrips: 190, rawPaid: 190, rawZero: 0, rawRev: 8742.00,
          adjRev: 10858.80, totalRev: 30545.80,
          dieselL: 8172, dieselCost: 11297.27, lubes: 255.00, repairs: 2300.00, insurance: 547.95, driverPay: 2504.67,
          totalCost: 16904.89, netProfit: 13640.91, marginPct: '+44.7%', statusClass: 'em'
        },
        Tb7: {
          code: 'Tb7', plate: '364656', owner: 'Hussein Bdeir', driver: 'Mohamad Habib (Full 2-Month Period)',
          trips: 282, paidTrips: 282, zeroTrips: 0, vol: 7928.5,
          salesTrips: 90, salesPaid: 90, salesZero: 0, salesRev: 4305.51,
          rawTrips: 192, rawPaid: 192, rawZero: 0, rawRev: 7660.00,
          adjRev: 5938.40, totalRev: 17903.91,
          dieselL: 6534, dieselCost: 9062.08, lubes: 160.00, repairs: 1323.00, insurance: 0.00, driverPay: 2796.99,
          totalCost: 13342.07, netProfit: 4561.84, marginPct: '+25.5%', statusClass: 'em'
        },
        Tb9: {
          code: 'Tb9', plate: '364168', owner: 'Jad Bdeir', driver: 'Ali Saleh (Full 2-Month Period)',
          trips: 352, paidTrips: 352, zeroTrips: 0, vol: 10818.0,
          salesTrips: 114, salesPaid: 114, salesZero: 0, salesRev: 6063.51,
          rawTrips: 238, rawPaid: 238, rawZero: 0, rawRev: 8408.00,
          adjRev: 6031.20, totalRev: 20502.71,
          dieselL: 6563, dieselCost: 9057.83, lubes: 275.00, repairs: 2604.69, insurance: 0.00, driverPay: 2194.00,
          totalCost: 14131.52, netProfit: 6371.19, marginPct: '+31.1%', statusClass: 'em'
        }
      }
    }
  };

  const LEAKAGE_BUCKETS = [
    {
      cat: '1. Bundled All-In Sales (Sabeh Beton / Partner Sites)',
      trips: '96 trips (2,840.1 m³)',
      tb1: 70, tb7: 13, tb9: 13,
      why: 'Delivered concrete price ($59-$82/m³) includes delivery, but Transport Charge column was left at $0.00.',
      action: 'Carve out $4.00/m³ internal haulage credit on Sabeh Beton & partner tickets so the fleet receives its transport revenue without changing customer invoices.',
      est: 11360.40,
      pillClass: 'em'
    },
    {
      cat: '2. Bundled All-In Sales (Wael el Haj / Halba & Akkar)',
      trips: '25 trips (869.1 m³)',
      tb1: 10, tb7: 4, tb9: 11,
      why: 'Long-haul northern deliveries (Halba / Akkar / Bebnine) billed all-in ($56.67-$86.96/m³) with $0.00 transport split.',
      action: 'Credit $140/trip on Halba/Akkar long-haul sales and $70-$78/trip on medium-haul bundled sales.',
      est: 2856.00,
      pillClass: 'em'
    },
    {
      cat: '3. Oct 12 Sibline Gap & Missing Sales Rate Rows',
      trips: '25 trips (664.0 m³)',
      tb1: 7, tb7: 9, tb9: 9,
      why: '11 Sibline Cement trips on Oct 12 ($80/trip paid on every other date) + 14 Ali Klait / Nahr Ibrahim / Batroun sales missing transport rate entries.',
      action: 'Backfill Oct 12 Sibline Cement at $80/trip ($880) and add missing site rows to the Delivery Transport Rate Table ($850).',
      est: 1730.00,
      pillClass: 'em'
    },
    {
      cat: '4. Aug 24 - Sep 3 Cutover Lag & Missing Raw Route Rates',
      trips: '19 trips (570.0 m³)',
      tb1: 6, tb7: 10, tb9: 3,
      why: '17 Dahr El Baydar trips during Aug 24 - Sep 3 still tagged Owner=WTC ($0 haulage) + 2 Amhaz/Mathaf raw trips missing a rate row.',
      action: 'Backdate Truck Ownership Log start date to Aug 24 ($850) and add Amhaz/Mathaf $50/trip rate ($100).',
      est: 950.00,
      pillClass: 'em'
    },
    {
      cat: '5. Internal Quarry & Inter-Plant Transfers (Aljawad / WTC)',
      trips: '100 trips (3,200.0 m³)',
      tb1: 21, tb7: 41, tb9: 38,
      why: '99 Aljawad Barouk internal quarry trips + 1 WTC inter-plant transfer. Intentionally $0 in external AP, but consumes ~3,200 L of Bdeir truck diesel and 100 driver shifts.',
      action: 'Credit internal shadow transfer rate ($60/trip on Aljawad Barouk, $20/trip inter-plant) when evaluating standalone truck commercial P&L.',
      est: 5932.00,
      pillClass: 'br'
    },
    {
      cat: '6. Thin-Margin Paid Route: SOIME / Karantina ($20/trip)',
      trips: '90 paid trips (2,839.2 m³)',
      tb1: 11, tb7: 25, tb9: 54,
      why: 'Paid at $20/trip ($0.63/m³), barely covering ~$19-$22 of round-trip fuel & driver time.',
      action: 'Review whether SOIME/Karantina internal transfer credit should be raised to $30-$35/trip (+$900 to +$1,350).',
      est: 0,
      pillClass: 'am'
    },
    {
      cat: '7. Thin-Margin Paid Route: Haj Ibrahim / Afak ($28/trip + OT)',
      trips: '2 paid OT trips (65.0 m³)',
      tb1: 2, tb7: 0, tb9: 0,
      why: '$28/trip revenue vs. ~$29 fuel + $13 driver OT = -$14 net loss per trip.',
      action: 'Re-price Afak delivery zone to >= $55/trip before dispatching overtime runs.',
      est: 0,
      pillClass: 'cr'
    }
  ];

  const RECON_FINDINGS = [
    {
      num: 'Finding 1',
      title: 'Overtime Allowance Variance: $1,429.00 True OT vs. $0.00 on Payroll Summary',
      severity: 'em',
      badge: '172 OT Trips Verified',
      body: 'In the Raw Material & Sales trip logs, every trip carries an Overtime flag (Yes = $13.00, Yes2 = $26.00, Super = $5.00), totaling 172 OT trips ($1,429.00) across the 3 Bdeir trucks. On the monthly Payroll Summary sheet, those same trips were rolled into the attendance bonus column while Overtime Allowance displayed $0.00. In addition, Ali Saleh (Tb9) had 32 verified OT trips (29 x $13 + 3 x $5 = $392) vs. $364 recorded (-$28.00 underpayment).'
    },
    {
      num: 'Finding 2',
      title: '269 Post-Cutover Trips Still Tagged Owner = WTC in Source Logs',
      severity: 'am',
      badge: '269 Stale Owner Tags',
      body: 'Although TB1, Tb7, and Tb9 transferred to Bdeir ownership on August 24, 2026, 269 raw material trips (including all 17 Dahr El Baydar trips between Aug 24 and Sep 3, 99 Aljawad Barouk trips, and 90 SOIME trips) remained tagged Owner = WTC in the raw intake log. Filtering any report by Owner = Bdeir instead of Truck Code (TB1, Tb7, Tb9) drops 27% of fleet activity.'
    },
    {
      num: 'Finding 3',
      title: '3,585 L Cross-Company Diesel Double-Counting Trap ($4,975.26 Over-Cost Risk)',
      severity: 'cr',
      badge: '3,585 L Duplicated Across Logs',
      body: 'Between Sep 24 and Oct 22, 16 diesel fills (3,585 L: TB1 1,197 L, Tb7 1,184 L, Tb9 1,204 L) were recorded in both the WTC Fuel Intake Log and the BBConstruction Fuel Log with identical invoice numbers and liters. Only 1 BBConstruction fill (Oct 23 Inv #20719, Tb7, 236 L = $302.08) is unique. Naive summation inflates fleet diesel from 21,269 L ($29,417.18) to 24,854 L ($34,392.44).'
    },
    {
      num: 'Finding 4',
      title: '2 Re-Assigned Sales Delivery Tickets (#18886 & #15089 = +$135.01 Variance)',
      severity: 'br',
      badge: '2 Tickets Re-Assigned',
      body: 'Two Sales Delivery tickets originally dispatched under Bdeir trucks were subsequently re-assigned in the central ledger: Bon #18886 (Aug 27, 2026, Sabeh Beton, 30.25 m³, $55.01 transport) from Tb7 to TB4, and Bon #15089 (Sep 8, 2026, Sibline, 26.9 m³, $80.00 transport) from Tb9 to TB12. Both are preserved in the 379-trip Cutover Audit for 100% reconciliation parity.'
    }
  ];

  function computeLiveFleetAnalysis() {
    const recs = (window.MFG_SEED && window.MFG_SEED.records) || {};
    const sales = typeof window.scopedRecords === 'function' ? window.scopedRecords('sales_tickets') : (recs.sales_tickets || []);
    const raw = typeof window.scopedRecords === 'function' ? window.scopedRecords('raw_material_intake') : (recs.raw_material_intake || []);
    const diesel = typeof window.scopedRecords === 'function' ? window.scopedRecords('diesel_logs') : (recs.diesel_logs || []);
    const oils = typeof window.scopedRecords === 'function' ? window.scopedRecords('oil_logs') : (recs.oil_logs || []);
    const maint = typeof window.scopedRecords === 'function' ? window.scopedRecords('maintenance_logs') : (recs.maintenance_logs || []);

    const bdeirSet = new Set(['TB1', 'TB7', 'TB9']);
    const normCode = (c) => {
      const u = String(c || '').trim().toUpperCase();
      if (u === 'TB7') return 'Tb7';
      if (u === 'TB9') return 'Tb9';
      return u;
    };

    const truckMap = {
      TB1: { code: 'TB1', plate: '360676', owner: 'Karim Bdeir', driver: 'Majed Karam / Ahmad Hamoud', trips: 0, paidTrips: 0, zeroTrips: 0, vol: 0, salesTrips: 0, salesPaid: 0, salesZero: 0, salesRev: 0, rawTrips: 0, rawPaid: 0, rawZero: 0, rawRev: 0, adjRev: 0, totalRev: 0, dieselL: 0, dieselCost: 0, lubes: 0, repairs: 0, insurance: 0, driverPay: 0, totalCost: 0, netProfit: 0 },
      Tb7: { code: 'Tb7', plate: '364656', owner: 'Hussein Bdeir', driver: 'Mohamad Habib', trips: 0, paidTrips: 0, zeroTrips: 0, vol: 0, salesTrips: 0, salesPaid: 0, salesZero: 0, salesRev: 0, rawTrips: 0, rawPaid: 0, rawZero: 0, rawRev: 0, adjRev: 0, totalRev: 0, dieselL: 0, dieselCost: 0, lubes: 0, repairs: 0, insurance: 0, driverPay: 0, totalCost: 0, netProfit: 0 },
      Tb9: { code: 'Tb9', plate: '364168', owner: 'Jad Bdeir', driver: 'Ali Saleh', trips: 0, paidTrips: 0, zeroTrips: 0, vol: 0, salesTrips: 0, salesPaid: 0, salesZero: 0, salesRev: 0, rawTrips: 0, rawPaid: 0, rawZero: 0, rawRev: 0, adjRev: 0, totalRev: 0, dieselL: 0, dieselCost: 0, lubes: 0, repairs: 0, insurance: 0, driverPay: 0, totalCost: 0, netProfit: 0 }
    };

    let wtcTrips = 0, bbcTrips = 0, wtcVol = 0, bbcVol = 0;

    for (const r of sales) {
      const u = String(r.truck_code || '').trim().toUpperCase();
      if (!bdeirSet.has(u)) continue;
      const k = normCode(u);
      const t = truckMap[k];
      const q = Number(r.qty_m3) || 0;
      const tr = Number(r.trans_total_usd) || 0;
      t.trips++;
      t.salesTrips++;
      t.vol += q;
      t.salesRev += tr;
      if (tr > 0.001) { t.paidTrips++; t.salesPaid++; }
      else { t.zeroTrips++; t.salesZero++; t.adjRev += (q * 4.0); }
      const co = String(r.company || 'WTC');
      if (co.toLowerCase().includes('bbc')) { bbcTrips++; bbcVol += q; }
      else { wtcTrips++; wtcVol += q; }
    }

    for (const r of raw) {
      const u = String(r.truck_code || '').trim().toUpperCase();
      if (!bdeirSet.has(u)) continue;
      const k = normCode(u);
      const t = truckMap[k];
      const q = Number(r.qty_m3) || 0;
      const tr = Number(r.transport_usd || r.trans_total_usd) || 0;
      t.trips++;
      t.rawTrips++;
      t.vol += q;
      t.rawRev += tr;
      if (tr > 0.001) { t.paidTrips++; t.rawPaid++; }
      else { t.zeroTrips++; t.rawZero++; t.adjRev += 60; }
      const co = String(r.company || 'WTC');
      if (co.toLowerCase().includes('bbc')) { bbcTrips++; bbcVol += q; }
      else { wtcTrips++; wtcVol += q; }
    }

    for (const r of diesel) {
      const u = String(r.equipment_code || r.truck_code || '').trim().toUpperCase();
      if (!bdeirSet.has(u)) continue;
      const k = normCode(u);
      const t = truckMap[k];
      const l = Number(r.liters) || 0;
      const c = Number(r.total_usd) || (l * 1.3878);
      t.dieselL += l;
      t.dieselCost += c;
    }

    for (const r of oils) {
      const u = String(r.equipment_code || r.truck_code || '').trim().toUpperCase();
      if (!bdeirSet.has(u)) continue;
      const k = normCode(u);
      truckMap[k].lubes += (Number(r.total_usd) || 0);
    }

    for (const r of maint) {
      const u = String(r.equipment_code || r.truck_code || '').trim().toUpperCase();
      if (!bdeirSet.has(u)) continue;
      const k = normCode(u);
      truckMap[k].repairs += (Number(r.cost_usd || r.total_usd) || 0);
    }

    let totTrips = 0, totVol = 0, totRev = 0, totCost = 0, totZero = 0;
    for (const k of ['TB1', 'Tb7', 'Tb9']) {
      const t = truckMap[k];
      const useAdj = state.mode !== 'recorded';
      t.totalRev = t.salesRev + t.rawRev + (useAdj ? t.adjRev : 0);
      t.totalCost = t.dieselCost + t.lubes + t.repairs + t.insurance + t.driverPay;
      t.netProfit = t.totalRev - t.totalCost;
      const pct = t.totalRev > 0 ? ((t.netProfit / t.totalRev) * 100).toFixed(1) : '0.0';
      t.marginPct = (t.netProfit >= 0 ? '+' : '') + pct + '%';
      t.statusClass = t.netProfit > 500 ? 'em' : (t.netProfit >= 0 ? 'am' : 'cr');
      totTrips += t.trips;
      totVol += t.vol;
      totRev += t.totalRev;
      totCost += t.totalCost;
      totZero += (useAdj ? 0 : t.zeroTrips);
    }

    const net = totRev - totCost;
    return {
      key: state.mode,
      label: 'Live Dynamic Slicer P&L',
      badge: fmtUSD(totRev, 0) + ' Rev | Net ' + fmtSignedUSD(net, 0),
      totalTrips: totTrips,
      wtcTrips,
      bbcTrips,
      totalVol: totVol,
      wtcVol,
      bbcVol,
      transRev: totRev,
      revSub: 'Live dynamic aggregation from active Company & Period filter',
      totalCost: totCost,
      costPerTrip: totTrips > 0 ? (totCost / totTrips) : 0,
      costPerM3: totVol > 0 ? (totCost / totVol) : 0,
      netProfit: net,
      marginPct: totRev > 0 ? (((net / totRev) * 100).toFixed(1) + '%') : '0.0%',
      netPerTrip: totTrips > 0 ? (net / totTrips) : 0,
      zeroTrips: totZero,
      zeroSub: 'Computed dynamically from active Sales & Raw Material tickets',
      trucks: truckMap
    };
  }

  function getActiveModel() {
    if (state.scope === 'live') {
      return computeLiveFleetAnalysis();
    }
    return CUTOVER_PNL_MODES[state.mode] || CUTOVER_PNL_MODES.recorded;
  }

  function renderSubTabPnl(m) {
    const t1 = m.trucks.TB1;
    const t7 = m.trucks.Tb7;
    const t9 = m.trucks.Tb9;
    const totSalesTrips = t1.salesTrips + t7.salesTrips + t9.salesTrips;
    const totRawTrips = t1.rawTrips + t7.rawTrips + t9.rawTrips;
    const totSalesRev = t1.salesRev + t7.salesRev + t9.salesRev;
    const totRawRev = t1.rawRev + t7.rawRev + t9.rawRev;
    const totAdjRev = t1.adjRev + t7.adjRev + t9.adjRev;
    const totDieselL = t1.dieselL + t7.dieselL + t9.dieselL;
    const totDieselCost = t1.dieselCost + t7.dieselCost + t9.dieselCost;
    const totLubes = t1.lubes + t7.lubes + t9.lubes;
    const totRepairs = t1.repairs + t7.repairs + t9.repairs;
    const totIns = t1.insurance + t7.insurance + t9.insurance;
    const totDriver = t1.driverPay + t7.driverPay + t9.driverPay;

    const truckCardsHtml = ['TB1', 'Tb7', 'Tb9'].map(code => {
      const tr = m.trucks[code];
      return `
        <div class="fpnl-truck-card">
          <div class="fpnl-truck-top">
            <div>
              <div class="fpnl-truck-name">${esc(tr.code)} · Plate ${esc(tr.plate)} (${esc(tr.owner)})</div>
              <div class="fpnl-truck-meta">Driver: ${esc(tr.driver)}</div>
            </div>
            <span class="fpnl-pill ${tr.statusClass}">Net ${fmtSignedUSD(tr.netProfit)} (${esc(tr.marginPct)})</span>
          </div>
          <div class="fpnl-kv"><span>Total Trips (Paid / $0.00)</span><strong>${fmtInt(tr.trips)} (${fmtInt(tr.paidTrips)} paid / ${fmtInt(tr.zeroTrips)} $0)</strong></div>
          <div class="fpnl-kv"><span>Total Volume Hauled</span><strong>${fmtNum(tr.vol, 1)} m³</strong></div>
          <div class="fpnl-kv"><span>Sales Delivery Revenue (${fmtInt(tr.salesTrips)} trips)</span><strong>${fmtUSD(tr.salesRev)}</strong></div>
          <div class="fpnl-kv"><span>Raw Material Haulage (${fmtInt(tr.rawTrips)} trips)</span><strong>${fmtUSD(tr.rawRev)}</strong></div>
          ${tr.adjRev > 0 ? `<div class="fpnl-kv"><span>Unbundled / Missing-Rate Credit</span><strong style="color:#047857;">+${fmtUSD(tr.adjRev)}</strong></div>` : ''}
          <div class="fpnl-kv"><span><strong>Total Revenue</strong></span><strong>${fmtUSD(tr.totalRev)} (${fmtUSD(tr.trips ? tr.totalRev / tr.trips : 0)}/trip)</strong></div>
          <div class="fpnl-kv"><span>Diesel Fuel (${fmtInt(tr.dieselL)} L de-duplicated)</span><strong>-${fmtUSD(tr.dieselCost)}</strong></div>
          <div class="fpnl-kv"><span>Repairs, Parts, Tires &amp; Lubes</span><strong>-${fmtUSD(tr.repairs + tr.lubes + tr.insurance)}</strong></div>
          <div class="fpnl-kv"><span>Driver Salary + Overtime</span><strong>-${fmtUSD(tr.driverPay)}</strong></div>
          <div class="fpnl-kv"><span><strong>Total Operating Costs</strong></span><strong>-${fmtUSD(tr.totalCost)} (${fmtUSD(tr.trips ? tr.totalCost / tr.trips : 0)}/trip)</strong></div>
        </div>
      `;
    }).join('');

    return `
      <div class="fpnl-kpi-grid">
        <div class="fpnl-kpi-card">
          <div class="fpnl-kpi-lbl">Total Trips Completed</div>
          <div class="fpnl-kpi-val">${fmtInt(m.totalTrips)} Trips</div>
          <div class="fpnl-kpi-sub">${fmtInt(m.wtcTrips)} WTC (74.9%) · ${fmtInt(m.bbcTrips)} BBConstruction (25.1%)</div>
        </div>
        <div class="fpnl-kpi-card tl">
          <div class="fpnl-kpi-lbl">Total Volume Hauled</div>
          <div class="fpnl-kpi-val">${fmtNum(m.totalVol, 1)} m³</div>
          <div class="fpnl-kpi-sub">${fmtNum(m.wtcVol, 1)} m³ WTC · ${fmtNum(m.bbcVol, 1)} m³ BBC</div>
        </div>
        <div class="fpnl-kpi-card em">
          <div class="fpnl-kpi-lbl">Transportation Revenue</div>
          <div class="fpnl-kpi-val">${fmtUSD(m.transRev)}</div>
          <div class="fpnl-kpi-sub">${esc(m.revSub)}</div>
        </div>
        <div class="fpnl-kpi-card am">
          <div class="fpnl-kpi-lbl">Total Operating Costs</div>
          <div class="fpnl-kpi-val">${fmtUSD(m.totalCost)}</div>
          <div class="fpnl-kpi-sub">${fmtUSD(m.costPerTrip)}/trip · ${fmtUSD(m.costPerM3)}/m³ (66.3% Diesel)</div>
        </div>
        <div class="fpnl-kpi-card ${m.netProfit >= 0 ? 'em' : 'cr'}">
          <div class="fpnl-kpi-lbl">Fleet Net Profit &amp; Margin</div>
          <div class="fpnl-kpi-val">${fmtSignedUSD(m.netProfit)}</div>
          <div class="fpnl-kpi-sub">Margin: ${esc(m.marginPct)} · ${fmtSignedUSD(m.netPerTrip)}/trip</div>
        </div>
        <div class="fpnl-kpi-card ${m.zeroTrips > 0 ? 'cr' : 'em'}">
          <div class="fpnl-kpi-lbl">Zero-Haulage ($0.00) Trips</div>
          <div class="fpnl-kpi-val">${fmtInt(m.zeroTrips)} / ${fmtInt(m.totalTrips)}</div>
          <div class="fpnl-kpi-sub">${esc(m.zeroSub)}</div>
        </div>
      </div>

      <div class="fpnl-truck-grid">
        ${truckCardsHtml}
      </div>

      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Consolidated Bdeir Fleet Income Statement (TB1 · Tb7 · Tb9 | WTC + BBConstruction Combined)</h4>
            <div class="fpnl-sec-sub">Switch P&amp;L Mode in the top-right bar to compare Recorded Ledger ($46,124.02) vs. Strict Adjusted ($63,020.42) vs. Full Benchmark ($68,952.42)</div>
          </div>
          <span class="fpnl-pill br">${esc(m.label)}</span>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>P&amp;L Line Item</th>
                <th class="num">TB1 · Plate 360676 (Karim Bdeir)</th>
                <th class="num">Tb7 · Plate 364656 (Hussein Bdeir)</th>
                <th class="num">Tb9 · Plate 364168 (Jad Bdeir)</th>
                <th class="num">Fleet Total (3 Trucks)</th>
                <th class="num">Per Trip / Share</th>
              </tr>
            </thead>
            <tbody>
              <tr class="fpnl-row-sec"><td colspan="6">1. Operational Volume &amp; Trip Coverage</td></tr>
              <tr>
                <td>Total Trips Completed (Sales Deliveries + Raw Material Intake)</td>
                <td class="num">${fmtInt(t1.trips)} (${fmtInt(t1.salesTrips)} S / ${fmtInt(t1.rawTrips)} R)</td>
                <td class="num">${fmtInt(t7.trips)} (${fmtInt(t7.salesTrips)} S / ${fmtInt(t7.rawTrips)} R)</td>
                <td class="num">${fmtInt(t9.trips)} (${fmtInt(t9.salesTrips)} S / ${fmtInt(t9.rawTrips)} R)</td>
                <td class="num"><strong>${fmtInt(m.totalTrips)} (${fmtInt(totSalesTrips)} S / ${fmtInt(totRawTrips)} R)</strong></td>
                <td class="num">100.0%</td>
              </tr>
              <tr>
                <td>Paid Trips vs. Zero-Haulage ($0.00) Trips</td>
                <td class="num">${fmtInt(t1.paidTrips)} paid / ${fmtInt(t1.zeroTrips)} $0</td>
                <td class="num">${fmtInt(t7.paidTrips)} paid / ${fmtInt(t7.zeroTrips)} $0</td>
                <td class="num">${fmtInt(t9.paidTrips)} paid / ${fmtInt(t9.zeroTrips)} $0</td>
                <td class="num"><strong>${fmtInt(m.totalTrips - m.zeroTrips)} paid / ${fmtInt(m.zeroTrips)} $0</strong></td>
                <td class="num">${m.totalTrips ? ((m.zeroTrips / m.totalTrips) * 100).toFixed(1) : '0.0'}% at $0</td>
              </tr>
              <tr>
                <td>Total Volume Transported (m³)</td>
                <td class="num">${fmtNum(t1.vol, 1)} m³</td>
                <td class="num">${fmtNum(t7.vol, 1)} m³</td>
                <td class="num">${fmtNum(t9.vol, 1)} m³</td>
                <td class="num"><strong>${fmtNum(m.totalVol, 1)} m³</strong></td>
                <td class="num">${fmtNum(m.totalTrips ? m.totalVol / m.totalTrips : 0, 2)} m³/trip</td>
              </tr>

              <tr class="fpnl-row-sec"><td colspan="6">2. Recorded &amp; Adjusted Transportation Revenue</td></tr>
              <tr>
                <td>Customer Sales Delivery Transport Revenue (WTC + BBConstruction)</td>
                <td class="num">${fmtUSD(t1.salesRev)}</td>
                <td class="num">${fmtUSD(t7.salesRev)}</td>
                <td class="num">${fmtUSD(t9.salesRev)}</td>
                <td class="num"><strong>${fmtUSD(totSalesRev)}</strong></td>
                <td class="num">${fmtUSD(totSalesTrips ? totSalesRev / totSalesTrips : 0)}/sales trip</td>
              </tr>
              <tr>
                <td>Raw Material Inbound Haulage Revenue (WTC + BBConstruction)</td>
                <td class="num">${fmtUSD(t1.rawRev)}</td>
                <td class="num">${fmtUSD(t7.rawRev)}</td>
                <td class="num">${fmtUSD(t9.rawRev)}</td>
                <td class="num"><strong>${fmtUSD(totRawRev)}</strong></td>
                <td class="num">${fmtUSD(totRawTrips ? totRawRev / totRawTrips : 0)}/raw trip</td>
              </tr>
              ${totAdjRev > 0 ? `
              <tr class="fpnl-row-adj">
                <td><strong>+ Unbundled All-In Sales &amp; Missing Route Rate Recovery</strong></td>
                <td class="num">+${fmtUSD(t1.adjRev)}</td>
                <td class="num">+${fmtUSD(t7.adjRev)}</td>
                <td class="num">+${fmtUSD(t9.adjRev)}</td>
                <td class="num"><strong>+${fmtUSD(totAdjRev)}</strong></td>
                <td class="num">+${fmtUSD(m.totalTrips ? totAdjRev / m.totalTrips : 0)}/trip</td>
              </tr>` : ''}
              <tr class="fpnl-row-tot">
                <td>TOTAL TRANSPORTATION REVENUE</td>
                <td class="num">${fmtUSD(t1.totalRev)}</td>
                <td class="num">${fmtUSD(t7.totalRev)}</td>
                <td class="num">${fmtUSD(t9.totalRev)}</td>
                <td class="num">${fmtUSD(m.transRev)}</td>
                <td class="num">${fmtUSD(m.totalTrips ? m.transRev / m.totalTrips : 0)}/trip</td>
              </tr>

              <tr class="fpnl-row-sec"><td colspan="6">3. Direct Operating Costs (De-Duplicated Across WTC &amp; BBConstruction)</td></tr>
              <tr>
                <td>Diesel Fuel Cost (${fmtInt(totDieselL)} L net after removing 3,585 L cross-company duplicates)</td>
                <td class="num">${fmtUSD(t1.dieselCost)} (${fmtInt(t1.dieselL)} L)</td>
                <td class="num">${fmtUSD(t7.dieselCost)} (${fmtInt(t7.dieselL)} L)</td>
                <td class="num">${fmtUSD(t9.dieselCost)} (${fmtInt(t9.dieselL)} L)</td>
                <td class="num"><strong>${fmtUSD(totDieselCost)}</strong></td>
                <td class="num">${fmtUSD(m.totalTrips ? totDieselCost / m.totalTrips : 0)}/trip (66.3%)</td>
              </tr>
              <tr>
                <td>Driver Base Salaries, Attendance Bonus &amp; Verified Overtime (172 OT trips)</td>
                <td class="num">${fmtUSD(t1.driverPay)}</td>
                <td class="num">${fmtUSD(t7.driverPay)}</td>
                <td class="num">${fmtUSD(t9.driverPay)}</td>
                <td class="num"><strong>${fmtUSD(totDriver)}</strong></td>
                <td class="num">${fmtUSD(m.totalTrips ? totDriver / m.totalTrips : 0)}/trip (16.9%)</td>
              </tr>
              <tr>
                <td>Repairs, Spare Parts, Tires, Electrical &amp; Workshop Maintenance</td>
                <td class="num">${fmtUSD(t1.repairs)}</td>
                <td class="num">${fmtUSD(t7.repairs)}</td>
                <td class="num">${fmtUSD(t9.repairs)}</td>
                <td class="num"><strong>${fmtUSD(totRepairs)}</strong></td>
                <td class="num">${fmtUSD(m.totalTrips ? totRepairs / m.totalTrips : 0)}/trip (14.0%)</td>
              </tr>
              <tr>
                <td>Motor Oil, Hydraulic Oil &amp; Lubricants (175 L)</td>
                <td class="num">${fmtUSD(t1.lubes)}</td>
                <td class="num">${fmtUSD(t7.lubes)}</td>
                <td class="num">${fmtUSD(t9.lubes)}</td>
                <td class="num"><strong>${fmtUSD(totLubes)}</strong></td>
                <td class="num">${fmtUSD(m.totalTrips ? totLubes / m.totalTrips : 0)}/trip (1.6%)</td>
              </tr>
              <tr>
                <td>Truck Insurance (Prorated 60/365 Days on $3,333.34 Annual Policy)</td>
                <td class="num">${fmtUSD(t1.insurance)}</td>
                <td class="num">${fmtUSD(t7.insurance)}</td>
                <td class="num">${fmtUSD(t9.insurance)}</td>
                <td class="num"><strong>${fmtUSD(totIns)}</strong></td>
                <td class="num">${fmtUSD(m.totalTrips ? totIns / m.totalTrips : 0)}/trip (1.2%)</td>
              </tr>
              <tr class="fpnl-row-tot">
                <td>TOTAL OPERATING COSTS</td>
                <td class="num">${fmtUSD(t1.totalCost)}</td>
                <td class="num">${fmtUSD(t7.totalCost)}</td>
                <td class="num">${fmtUSD(t9.totalCost)}</td>
                <td class="num">${fmtUSD(m.totalCost)}</td>
                <td class="num">${fmtUSD(m.costPerTrip)}/trip</td>
              </tr>

              <tr class="fpnl-row-tot">
                <td>NET PROFIT / (LOSS) &amp; OPERATING MARGIN</td>
                <td class="num"><span class="fpnl-pill ${t1.statusClass}">${fmtSignedUSD(t1.netProfit)} (${esc(t1.marginPct)})</span></td>
                <td class="num"><span class="fpnl-pill ${t7.statusClass}">${fmtSignedUSD(t7.netProfit)} (${esc(t7.marginPct)})</span></td>
                <td class="num"><span class="fpnl-pill ${t9.statusClass}">${fmtSignedUSD(t9.netProfit)} (${esc(t9.marginPct)})</span></td>
                <td class="num"><span class="fpnl-pill ${m.netProfit >= 0 ? 'em' : 'cr'}">${fmtSignedUSD(m.netProfit)} (${esc(m.marginPct)})</span></td>
                <td class="num">${fmtSignedUSD(m.netPerTrip)}/trip</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">WTC vs. BBConstruction Work Coverage Matrix (999 Trips Across Both Sister Plants)</h4>
            <div class="fpnl-sec-sub">Every trip of TB1, Tb7, and Tb9 reconciled across WTC (748 trips) and BBConstruction (251 trips)</div>
          </div>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Company &amp; Stream</th>
                <th class="num">TB1 (360676)</th>
                <th class="num">Tb7 (364656)</th>
                <th class="num">Tb9 (364168)</th>
                <th class="num">Total Trips (Paid / $0)</th>
                <th class="num">Volume (m³)</th>
                <th class="num">Recorded Trans. Rev</th>
                <th class="num">Unbooked ($0) Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>WTC · Customer Sales Deliveries</strong></td>
                <td class="num">168 (88 / 80 $0)</td>
                <td class="num">87 (63 / 24 $0)</td>
                <td class="num">105 (74 / 31 $0)</td>
                <td class="num"><strong>360 (225 / 135 $0)</strong></td>
                <td class="num">10,331.2 m³</td>
                <td class="num">$19,708.02</td>
                <td class="num" style="color:#047857;">+$11,360.40</td>
              </tr>
              <tr>
                <td><strong>WTC · Raw Material Intake</strong></td>
                <td class="num">132 (98 / 34 $0)</td>
                <td class="num">126 (74 / 52 $0)</td>
                <td class="num">130 (87 / 43 $0)</td>
                <td class="num"><strong>388 (259 / 129 $0)</strong></td>
                <td class="num">10,840.8 m³</td>
                <td class="num">$13,868.00</td>
                <td class="num" style="color:#047857;">+$11,328.00</td>
              </tr>
              <tr class="fpnl-row-sec">
                <td>Subtotal WTC Operations (74.9% of Trips)</td>
                <td class="num">300 (186 / 114 $0)</td>
                <td class="num">213 (137 / 76 $0)</td>
                <td class="num">235 (161 / 74 $0)</td>
                <td class="num">748 (484 / 264 $0)</td>
                <td class="num">21,172.0 m³</td>
                <td class="num">$33,576.02</td>
                <td class="num">+$22,688.40</td>
              </tr>
              <tr>
                <td><strong>BBConstruction · Customer Sales Deliveries</strong></td>
                <td class="num">7 (7 / 0 $0)</td>
                <td class="num">3 (3 / 0 $0)</td>
                <td class="num">9 (9 / 0 $0)</td>
                <td class="num"><strong>19 (19 / 0 $0)</strong></td>
                <td class="num">648.0 m³</td>
                <td class="num">$1,606.00</td>
                <td class="num">$0.00</td>
              </tr>
              <tr>
                <td><strong>BBConstruction · Raw Material Intake</strong></td>
                <td class="num">58 (58 / 0 $0)</td>
                <td class="num">66 (65 / 1 $0)</td>
                <td class="num">108 (108 / 0 $0)</td>
                <td class="num"><strong>232 (231 / 1 $0)</strong></td>
                <td class="num">6,620.2 m³</td>
                <td class="num">$10,942.00</td>
                <td class="num" style="color:#047857;">+$140.00</td>
              </tr>
              <tr class="fpnl-row-sec">
                <td>Subtotal BBConstruction Operations (25.1% of Trips)</td>
                <td class="num">65 (65 / 0 $0)</td>
                <td class="num">69 (68 / 1 $0)</td>
                <td class="num">117 (117 / 0 $0)</td>
                <td class="num">251 (250 / 1 $0)</td>
                <td class="num">7,268.2 m³</td>
                <td class="num">$12,548.00</td>
                <td class="num">+$140.00</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>COMBINED FLEET TOTAL (WTC + BBCONSTRUCTION)</td>
                <td class="num">365 (251 / 114 $0)</td>
                <td class="num">282 (205 / 77 $0)</td>
                <td class="num">352 (278 / 74 $0)</td>
                <td class="num">999 (734 / 265 $0)</td>
                <td class="num">28,440.2 m³</td>
                <td class="num">$46,124.02</td>
                <td class="num">+$22,828.40</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderSubTabZero() {
    const q = state.zeroSearch.trim().toLowerCase();
    const rows = CUTOVER_DATA.zero_haulage_groups.filter(r => {
      if (state.zeroCompany !== 'ALL' && r.company !== state.zeroCompany) return false;
      if (state.zeroStream !== 'ALL' && !r.stream.toLowerCase().includes(state.zeroStream.toLowerCase())) return false;
      if (state.zeroTruck === 'TB1' && !(r.TB1 > 0)) return false;
      if (state.zeroTruck === 'Tb7' && !(r.Tb7 > 0)) return false;
      if (state.zeroTruck === 'Tb9' && !(r.Tb9 > 0)) return false;
      if (q) {
        const hay = (r.stream + ' ' + r.company + ' ' + r.party + ' ' + r.loc + ' ' + r.mat + ' ' + r.cat + ' ' + r.bons).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    let sumTrips = 0, sumTB1 = 0, sumTb7 = 0, sumTb9 = 0, sumVol = 0, sumBilled = 0, sumEst = 0;
    for (const r of rows) {
      sumTrips += (Number(r.trips) || 0);
      sumTB1 += (Number(r.TB1) || 0);
      sumTb7 += (Number(r.Tb7) || 0);
      sumTb9 += (Number(r.Tb9) || 0);
      sumVol += (Number(r.vol) || 0);
      sumBilled += (Number(r.tot_usd) || 0);
      sumEst += (Number(r.est_rev) || 0);
    }

    return `
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">7 Forensic Leakage Buckets &amp; Actionable Fixes (265 Zero-Haulage Trips + 92 Thin-Margin Paid Trips)</h4>
            <div class="fpnl-sec-sub">Breakdown of why 26.5% of Bdeir fleet trips carried $0.00 transport credit and exact rule adjustments to recover +$16,896.40 to +$22,828.40</div>
          </div>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Leakage Bucket</th>
                <th class="num">Affected Trips</th>
                <th class="num">TB1 / Tb7 / Tb9</th>
                <th>Root Cause in Ledger</th>
                <th>Recommended Action</th>
                <th class="num">Recoverable Value</th>
              </tr>
            </thead>
            <tbody>
              ${LEAKAGE_BUCKETS.map(b => `
                <tr>
                  <td><strong>${esc(b.cat)}</strong></td>
                  <td class="num">${esc(b.trips)}</td>
                  <td class="num">${b.tb1} / ${b.tb7} / ${b.tb9}</td>
                  <td>${esc(b.why)}</td>
                  <td>${esc(b.action)}</td>
                  <td class="num"><span class="fpnl-pill ${b.pillClass}">${b.est > 0 ? '+' + fmtUSD(b.est) : 'Rate Review'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Complete 33-Route-Group Schedule of All 265 Zero-Haulage ($0.00) Trips</h4>
            <div class="fpnl-sec-sub">Includes every Customer/Supplier, Site, Date Range, Material Price, Benchmark Rate, and Bon/Invoice Numbers</div>
          </div>
          <span class="fpnl-pill am">${fmtInt(rows.length)} Route Groups · ${fmtInt(sumTrips)} Trips · +${fmtUSD(sumEst)}</span>
        </div>
        <div class="fpnl-filter-bar">
          <input type="search" id="fpnlZeroSearch" placeholder="Search customer, supplier, location, bon/invoice #..." value="${esc(state.zeroSearch)}">
          <select id="fpnlZeroStream" data-freq-exempt="1">
            <option value="ALL" ${state.zeroStream === 'ALL' ? 'selected' : ''}>All Streams (265)</option>
            <option value="Sales" ${state.zeroStream === 'Sales' ? 'selected' : ''}>Sales Delivery (135)</option>
            <option value="Raw" ${state.zeroStream === 'Raw' ? 'selected' : ''}>Raw Material (130)</option>
          </select>
          <select id="fpnlZeroTruck" data-freq-exempt="1">
            <option value="ALL" ${state.zeroTruck === 'ALL' ? 'selected' : ''}>All Bdeir Trucks (265)</option>
            <option value="TB1" ${state.zeroTruck === 'TB1' ? 'selected' : ''}>TB1 · 360676 (114 $0 trips)</option>
            <option value="Tb7" ${state.zeroTruck === 'Tb7' ? 'selected' : ''}>Tb7 · 364656 (77 $0 trips)</option>
            <option value="Tb9" ${state.zeroTruck === 'Tb9' ? 'selected' : ''}>Tb9 · 364168 (74 $0 trips)</option>
          </select>
          <select id="fpnlZeroCompany" data-freq-exempt="1">
            <option value="ALL" ${state.zeroCompany === 'ALL' ? 'selected' : ''}>All Companies (265)</option>
            <option value="WTC" ${state.zeroCompany === 'WTC' ? 'selected' : ''}>WTC (264)</option>
            <option value="BBConstruction" ${state.zeroCompany === 'BBConstruction' ? 'selected' : ''}>BBConstruction (1)</option>
          </select>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Stream &amp; Co.</th>
                <th>Customer / Supplier &amp; Site</th>
                <th>Material</th>
                <th class="num">Trips</th>
                <th class="num">TB1 / Tb7 / Tb9</th>
                <th class="num">Vol (m³)</th>
                <th class="num">Billed Total ($)</th>
                <th>Leakage Category &amp; Benchmark Rate</th>
                <th class="num">Est. Unbooked ($)</th>
                <th>Bon / Invoice Numbers</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td><strong>${esc(r.company)}</strong><br><small style="color:var(--ink-soft)">${esc(r.stream)}</small></td>
                  <td><strong>${esc(r.party)}</strong><br><small style="color:var(--ink-soft)">${esc(r.loc)} (${esc(r.first)} to ${esc(r.last)})</small></td>
                  <td>${esc(r.mat)}</td>
                  <td class="num"><strong>${fmtInt(r.trips)}</strong></td>
                  <td class="num">${r.TB1} / ${r.Tb7} / ${r.Tb9}</td>
                  <td class="num">${fmtNum(r.vol, 1)}</td>
                  <td class="num">${fmtUSD(r.tot_usd)}</td>
                  <td><strong>${esc(r.cat)}</strong><br><small style="color:var(--ink-soft)">${esc(r.bench)}</small></td>
                  <td class="num"><span class="fpnl-pill em">+${fmtUSD(r.est_rev)}</span></td>
                  <td style="max-width:240px;font-size:11px;color:var(--ink-soft);word-break:break-word;">${esc(r.bons)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">TOTAL FILTERED ZERO-HAULAGE ROUTES (${fmtInt(rows.length)} Groups)</td>
                <td class="num">${fmtInt(sumTrips)}</td>
                <td class="num">${fmtInt(sumTB1)} / ${fmtInt(sumTb7)} / ${fmtInt(sumTb9)}</td>
                <td class="num">${fmtNum(sumVol, 1)} m³</td>
                <td class="num">${fmtUSD(sumBilled)}</td>
                <td></td>
                <td class="num">+${fmtUSD(sumEst)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderSubTabRoutes() {
    const combined = [
      ...CUTOVER_DATA.sales_sites.map(r => ({
        stream: 'Sales Delivery',
        company: r.company,
        party: r.customer,
        loc: r.location,
        trips: r.trips,
        paid: r.paid,
        zero: r.zero,
        TB1: r.TB1,
        Tb7: r.Tb7,
        Tb9: r.Tb9,
        vol: r.vol,
        mat_usd: r.mat_usd,
        trans_usd: r.trans_usd,
        tot_usd: r.tot_usd,
        unit_rate: r.paid > 0 ? (r.trans_usd / r.paid) : 0,
        status: r.zero === 0 ? 'Paid' : (r.paid === 0 ? 'All $0' : 'Mixed')
      })),
      ...CUTOVER_DATA.raw_sites.map(r => ({
        stream: 'Raw Material',
        company: r.company,
        party: r.supplier,
        loc: r.site + ' (' + r.material + ')',
        trips: r.trips,
        paid: r.paid,
        zero: r.zero,
        TB1: r.TB1,
        Tb7: r.Tb7,
        Tb9: r.Tb9,
        vol: r.vol,
        mat_usd: 0,
        trans_usd: r.trans_usd,
        tot_usd: r.trans_usd,
        unit_rate: r.unit_rate || (r.paid > 0 ? (r.trans_usd / r.paid) : 0),
        status: r.zero === 0 ? 'Paid' : (r.paid === 0 ? 'All $0' : 'Mixed')
      }))
    ];

    const q = state.routeSearch.trim().toLowerCase();
    const rows = combined.filter(r => {
      if (state.routeStream !== 'ALL' && r.stream !== state.routeStream) return false;
      if (state.routeCompany !== 'ALL' && r.company !== state.routeCompany) return false;
      if (state.routeTruck === 'TB1' && !(r.TB1 > 0)) return false;
      if (state.routeTruck === 'Tb7' && !(r.Tb7 > 0)) return false;
      if (state.routeTruck === 'Tb9' && !(r.Tb9 > 0)) return false;
      if (state.routePricing === 'PAID' && !(r.paid > 0 && r.zero === 0)) return false;
      if (state.routePricing === 'ZERO' && !(r.zero > 0)) return false;
      if (q) {
        const hay = (r.stream + ' ' + r.company + ' ' + r.party + ' ' + r.loc).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    let sTrips = 0, sPaid = 0, sZero = 0, sTB1 = 0, sTb7 = 0, sTb9 = 0, sVol = 0, sTrans = 0;
    for (const r of rows) {
      sTrips += r.trips; sPaid += r.paid; sZero += r.zero;
      sTB1 += r.TB1; sTb7 += r.Tb7; sTb9 += r.Tb9;
      sVol += r.vol; sTrans += r.trans_usd;
    }

    return `
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">All 108 WTC &amp; BBConstruction Routes Explorer (60 Sales Delivery Sites + 48 Raw Material Routes = 999 Trips)</h4>
            <div class="fpnl-sec-sub">Filter by stream, truck, company, or pricing status to inspect trip counts, volume, and transport revenue per destination</div>
          </div>
          <span class="fpnl-pill br">${fmtInt(rows.length)} Routes · ${fmtInt(sTrips)} Trips · ${fmtUSD(sTrans)}</span>
        </div>
        <div class="fpnl-filter-bar">
          <input type="search" id="fpnlRouteSearch" placeholder="Search customer, supplier, quarry, delivery site..." value="${esc(state.routeSearch)}">
          <select id="fpnlRouteStream" data-freq-exempt="1">
            <option value="ALL" ${state.routeStream === 'ALL' ? 'selected' : ''}>All Streams (999 Trips)</option>
            <option value="Raw Material" ${state.routeStream === 'Raw Material' ? 'selected' : ''}>Raw Material Intake (620 Trips)</option>
            <option value="Sales Delivery" ${state.routeStream === 'Sales Delivery' ? 'selected' : ''}>Sales Deliveries (379 Trips)</option>
          </select>
          <select id="fpnlRouteTruck" data-freq-exempt="1">
            <option value="ALL" ${state.routeTruck === 'ALL' ? 'selected' : ''}>All Bdeir Trucks (999)</option>
            <option value="TB1" ${state.routeTruck === 'TB1' ? 'selected' : ''}>TB1 · 360676 (365 Trips)</option>
            <option value="Tb9" ${state.routeTruck === 'Tb9' ? 'selected' : ''}>Tb9 · 364168 (352 Trips)</option>
            <option value="Tb7" ${state.routeTruck === 'Tb7' ? 'selected' : ''}>Tb7 · 364656 (282 Trips)</option>
          </select>
          <select id="fpnlRouteCompany" data-freq-exempt="1">
            <option value="ALL" ${state.routeCompany === 'ALL' ? 'selected' : ''}>All Companies (999)</option>
            <option value="WTC" ${state.routeCompany === 'WTC' ? 'selected' : ''}>WTC (748 Trips)</option>
            <option value="BBConstruction" ${state.routeCompany === 'BBConstruction' ? 'selected' : ''}>BBConstruction (251 Trips)</option>
          </select>
          <select id="fpnlRoutePricing" data-freq-exempt="1">
            <option value="ALL" ${state.routePricing === 'ALL' ? 'selected' : ''}>All Pricing Statuses</option>
            <option value="PAID" ${state.routePricing === 'PAID' ? 'selected' : ''}>Fully Paid Routes Only</option>
            <option value="ZERO" ${state.routePricing === 'ZERO' ? 'selected' : ''}>Routes With $0.00 Trips</option>
          </select>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Stream &amp; Co.</th>
                <th>Customer / Supplier</th>
                <th>Site / Material</th>
                <th class="num">Total Trips</th>
                <th class="num">Paid / $0</th>
                <th class="num">TB1 / Tb7 / Tb9</th>
                <th class="num">Volume (m³)</th>
                <th class="num">Avg Paid Rate</th>
                <th class="num">Recorded Trans ($)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td><strong>${esc(r.company)}</strong> · ${esc(r.stream)}</td>
                  <td><strong>${esc(r.party)}</strong></td>
                  <td>${esc(r.loc)}</td>
                  <td class="num"><strong>${fmtInt(r.trips)}</strong></td>
                  <td class="num">${fmtInt(r.paid)} / ${fmtInt(r.zero)}</td>
                  <td class="num">${r.TB1} / ${r.Tb7} / ${r.Tb9}</td>
                  <td class="num">${fmtNum(r.vol, 1)}</td>
                  <td class="num">${r.unit_rate > 0 ? fmtUSD(r.unit_rate) + '/trip' : '$0.00'}</td>
                  <td class="num"><strong>${fmtUSD(r.trans_usd)}</strong></td>
                  <td><span class="fpnl-pill ${r.zero === 0 ? 'em' : (r.paid === 0 ? 'cr' : 'am')}">${esc(r.status)}</span></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">TOTAL FILTERED ROUTES (${fmtInt(rows.length)} Route Groups)</td>
                <td class="num">${fmtInt(sTrips)}</td>
                <td class="num">${fmtInt(sPaid)} / ${fmtInt(sZero)}</td>
                <td class="num">${fmtInt(sTB1)} / ${fmtInt(sTb7)} / ${fmtInt(sTb9)}</td>
                <td class="num">${fmtNum(sVol, 1)} m³</td>
                <td class="num">${sPaid > 0 ? fmtUSD(sTrans / sPaid) + '/paid' : '$0.00'}</td>
                <td class="num">${fmtUSD(sTrans)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderSubTabExpenses() {
    const q = state.expSearch.trim().toLowerCase();
    const rows = CUTOVER_DATA.truck_expenses.filter(r => {
      if (state.expTruck !== 'ALL' && r.truck !== state.expTruck) return false;
      if (state.expCat !== 'ALL' && r.cat !== state.expCat) return false;
      if (q) {
        const hay = (r.date + ' ' + r.truck + ' ' + r.cat + ' ' + r.sub + ' ' + r.supplier + ' ' + r.desc + ' ' + r.inv).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    let sumAmt = 0;
    for (const r of rows) sumAmt += (Number(r.amt) || 0);

    return `
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Cross-Company Diesel De-Duplication &amp; Valuation Schedule (21,269 L Net = $29,417.18)</h4>
            <div class="fpnl-sec-sub">Eliminates 16 duplicated Sep 24 - Oct 22 fills (3,585 L = $4,975.26) logged simultaneously in both WTC and BBConstruction</div>
          </div>
          <span class="fpnl-pill em">3,585 L Duplicates Removed</span>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Truck &amp; Plate</th>
                <th class="num">WTC Logged L (Fills)</th>
                <th class="num">BBC Logged L (Fills)</th>
                <th class="num">Less Duplicated L</th>
                <th class="num">Net True Diesel (L)</th>
                <th class="num">Direct Supplier Bills ($)</th>
                <th class="num">WTC Bulk Tank @ $1.3878/L</th>
                <th class="num">Unique BBC Fill ($)</th>
                <th class="num">Total True Diesel Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>TB1 · Plate 360676</strong> (Karim Bdeir)</td>
                <td class="num">8,172 L (44)</td>
                <td class="num">1,197 L (5)</td>
                <td class="num" style="color:#B91C1C;">-1,197 L (5 dup)</td>
                <td class="num"><strong>8,172 L (44)</strong></td>
                <td class="num">$1,987.92 (1,464 L)</td>
                <td class="num">$9,309.35 (6,708 L)</td>
                <td class="num">$0.00 (0 L)</td>
                <td class="num"><strong>$11,297.27</strong> ($30.95/trip)</td>
              </tr>
              <tr>
                <td><strong>Tb7 · Plate 364656</strong> (Hussein Bdeir)</td>
                <td class="num">6,298 L (32)</td>
                <td class="num">1,420 L (6)</td>
                <td class="num" style="color:#B91C1C;">-1,184 L (5 dup)</td>
                <td class="num"><strong>6,534 L (33)</strong></td>
                <td class="num">$1,872.32 (1,379 L)</td>
                <td class="num">$6,887.68 (4,919 L)</td>
                <td class="num">$302.08 (236 L Inv #20719)</td>
                <td class="num"><strong>$9,062.08</strong> ($32.14/trip)</td>
              </tr>
              <tr>
                <td><strong>Tb9 · Plate 364168</strong> (Jad Bdeir)</td>
                <td class="num">6,563 L (32)</td>
                <td class="num">1,204 L (6)</td>
                <td class="num" style="color:#B91C1C;">-1,204 L (6 dup)</td>
                <td class="num"><strong>6,563 L (32)</strong></td>
                <td class="num">$1,511.31 (1,125 L)</td>
                <td class="num">$7,546.52 (5,438 L)</td>
                <td class="num">$0.00 (0 L)</td>
                <td class="num"><strong>$9,057.83</strong> ($25.73/trip)</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>FLEET TOTAL (3 TRUCKS)</td>
                <td class="num">21,033 L (108)</td>
                <td class="num">3,821 L (17)</td>
                <td class="num">-3,585 L (16 dup)</td>
                <td class="num">21,269 L (109)</td>
                <td class="num">$5,371.55 (3,968 L)</td>
                <td class="num">$23,743.55 (17,065 L)</td>
                <td class="num">$302.08 (236 L)</td>
                <td class="num">$29,417.18 ($29.45/trip)</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Itemized Truck Expense, Repair, Parts, Insurance, Lubricants &amp; Direct Fuel Ledger (85 Voucher Entries)</h4>
            <div class="fpnl-sec-sub">Every direct supplier invoice and oil/lubricant draw booked to TB1 (360676), Tb7 (364656), and Tb9 (364168)</div>
          </div>
          <span class="fpnl-pill br">${fmtInt(rows.length)} Entries · ${fmtUSD(sumAmt)}</span>
        </div>
        <div class="fpnl-filter-bar">
          <input type="search" id="fpnlExpSearch" placeholder="Search supplier, part description, invoice #, subcategory..." value="${esc(state.expSearch)}">
          <select id="fpnlExpTruck" data-freq-exempt="1">
            <option value="ALL" ${state.expTruck === 'ALL' ? 'selected' : ''}>All Trucks (85 Entries)</option>
            <option value="TB1" ${state.expTruck === 'TB1' ? 'selected' : ''}>TB1 · 360676 (33 Entries)</option>
            <option value="Tb9" ${state.expTruck === 'Tb9' ? 'selected' : ''}>Tb9 · 364168 (28 Entries)</option>
            <option value="Tb7" ${state.expTruck === 'Tb7' ? 'selected' : ''}>Tb7 · 364656 (24 Entries)</option>
          </select>
          <select id="fpnlExpCat" data-freq-exempt="1">
            <option value="ALL" ${state.expCat === 'ALL' ? 'selected' : ''}>All Expense Categories (85)</option>
            <option value="Repairs & Maintenance" ${state.expCat === 'Repairs & Maintenance' ? 'selected' : ''}>Repairs &amp; Maintenance (46)</option>
            <option value="Direct Diesel Bills" ${state.expCat === 'Direct Diesel Bills' ? 'selected' : ''}>Direct Diesel Bills (21)</option>
            <option value="Oils & Lubricants" ${state.expCat === 'Oils & Lubricants' ? 'selected' : ''}>Oils &amp; Lubricants (17)</option>
            <option value="Insurance (Annual Policy)" ${state.expCat === 'Insurance (Annual Policy)' ? 'selected' : ''}>Insurance Policy (1)</option>
          </select>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Truck</th>
                <th>Category &amp; Sub-Type</th>
                <th>Supplier / Source</th>
                <th>Description</th>
                <th>Invoice #</th>
                <th class="num">Qty</th>
                <th class="num">Amount ($)</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${esc(r.date)}</td>
                  <td><strong>${esc(r.truck)}</strong></td>
                  <td><strong>${esc(r.cat)}</strong><br><small style="color:var(--ink-soft)">${esc(r.sub)}</small></td>
                  <td>${esc(r.supplier)}</td>
                  <td>${esc(r.desc)}</td>
                  <td>${esc(r.inv)}</td>
                  <td class="num">${fmtNum(r.qty, 1)}</td>
                  <td class="num"><strong>${fmtUSD(r.amt)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="7">TOTAL FILTERED VOUCHER ENTRIES (${fmtInt(rows.length)} Bills)</td>
                <td class="num">${fmtUSD(sumAmt)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderSubTabOvertime() {
    const q = state.otSearch.trim().toLowerCase();
    const rows = CUTOVER_DATA.ot_list.filter(r => {
      if (state.otTruck !== 'ALL' && r.truck !== state.otTruck) return false;
      if (state.otDriver !== 'ALL' && !r.driver.toLowerCase().includes(state.otDriver.toLowerCase())) return false;
      if (q) {
        const hay = (r.date + ' ' + r.truck + ' ' + r.driver + ' ' + r.company + ' ' + r.stream + ' ' + r.party + ' ' + r.loc + ' ' + r.bon).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    let sumPay = 0, sumTrans = 0;
    for (const r of rows) {
      sumPay += (Number(r.pay) || 0);
      sumTrans += (Number(r.trans_usd) || 0);
    }

    return `
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Driver Payroll, Attendance Bonus &amp; Overtime Reconciliation (Aug 24 - Oct 23, 2026)</h4>
            <div class="fpnl-sec-sub">Reconciles the 172 verified Overtime trips ($1,429.00) against the $7,495.66 recorded payroll ($7,523.66 corrected for Ali Saleh's +$28 OT)</div>
          </div>
          <span class="fpnl-pill em">172 OT Trips = $1,429.00</span>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Driver &amp; Assigned Truck</th>
                <th>Active Period &amp; Days Worked</th>
                <th class="num">Base Salary ($)</th>
                <th class="num">Attendance Bonus ($)</th>
                <th class="num">Verified OT Trips &amp; Pay ($)</th>
                <th class="num">Recorded Total Pay ($)</th>
                <th class="num">Corrected Total Pay ($)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Majed Karam</strong> · TB1 (360676)</td>
                <td>Aug 24 - Oct 15, 2026 (44 / 52 days)</td>
                <td class="num">$1,320.00</td>
                <td class="num">$140.00</td>
                <td class="num">46 OT trips ($450.00)</td>
                <td class="num"><strong>$1,910.00</strong></td>
                <td class="num">$1,910.00 (Exact match)</td>
              </tr>
              <tr>
                <td><strong>Ahmad Hamoud</strong> · TB1 (360676)</td>
                <td>Oct 16 - Oct 23, 2026 (8 / 8 days, pro-rated)</td>
                <td class="num">$373.33</td>
                <td class="num">$107.34</td>
                <td class="num">9 OT trips ($114.00)</td>
                <td class="num"><strong>$594.67</strong></td>
                <td class="num">$594.67 (Exact match)</td>
              </tr>
              <tr>
                <td><strong>Mohamad Habib</strong> · Tb7 (364656)</td>
                <td>Aug 24 - Oct 23, 2026 (52 / 60 days)</td>
                <td class="num">$1,820.00</td>
                <td class="num">$503.99</td>
                <td class="num">85 OT trips ($473.00)</td>
                <td class="num"><strong>$2,796.99</strong></td>
                <td class="num">$2,796.99 (Exact match)</td>
              </tr>
              <tr>
                <td><strong>Ali Saleh</strong> · Tb9 (364168)</td>
                <td>Aug 24 - Oct 23, 2026 (52 / 60 days)</td>
                <td class="num">$1,830.00</td>
                <td class="num">$0.00</td>
                <td class="num">32 OT trips ($392.00 true vs $364)</td>
                <td class="num"><strong>$2,194.00</strong></td>
                <td class="num" style="color:#B45309;"><strong>$2,222.00 (+$28.00 OT due)</strong></td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL DRIVER COMPENSATION (4 DRIVERS / 3 TRUCKS)</td>
                <td>156 Driver-Days Worked</td>
                <td class="num">$5,343.33</td>
                <td class="num">$751.33</td>
                <td class="num">172 OT trips ($1,429.00)</td>
                <td class="num">$7,495.66</td>
                <td class="num">$7,523.66</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Truck &amp; Driver Head-to-Head Operational Benchmarks (TB1 vs. Tb7 vs. Tb9)</h4>
            <div class="fpnl-sec-sub">7 efficiency ratios comparing fuel burn, payload, repairs, and unit economics across the 3 trucks</div>
          </div>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Operational Benchmark Metric</th>
                <th class="num">TB1 · 360676 (Karim Bdeir)</th>
                <th class="num">Tb7 · 364656 (Hussein Bdeir)</th>
                <th class="num">Tb9 · 364168 (Jad Bdeir)</th>
                <th class="num">Fleet Average / Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1. Daily Trip Velocity (Trips per Active Operating Day)</td>
                <td class="num"><strong>7.02 trips/day</strong> (365 / 52d)</td>
                <td class="num">5.42 trips/day (282 / 52d)</td>
                <td class="num">6.77 trips/day (352 / 52d)</td>
                <td class="num">6.40 trips/truck/day</td>
              </tr>
              <tr>
                <td>2. Average Payload per Trip (m³ / trip)</td>
                <td class="num">26.56 m³/trip</td>
                <td class="num">28.12 m³/trip</td>
                <td class="num"><strong>30.73 m³/trip</strong></td>
                <td class="num">28.47 m³/trip</td>
              </tr>
              <tr>
                <td>3. Diesel Burn Efficiency (Liters per Trip &amp; Liters per m³)</td>
                <td class="num">22.39 L/trip (0.84 L/m³)</td>
                <td class="num">23.17 L/trip (0.82 L/m³)</td>
                <td class="num"><strong>18.64 L/trip (0.61 L/m³)</strong></td>
                <td class="num">21.29 L/trip (0.75 L/m³)</td>
              </tr>
              <tr>
                <td>4. Zero-Haulage ($0.00) Exposure (% of Total Trips Unpaid)</td>
                <td class="num" style="color:#B91C1C;">31.2% (114 of 365)</td>
                <td class="num">27.3% (77 of 282)</td>
                <td class="num"><strong>21.0% (74 of 352)</strong></td>
                <td class="num">26.5% (265 of 999)</td>
              </tr>
              <tr>
                <td>5. Repairs, Parts &amp; Tires per Trip ($ / trip)</td>
                <td class="num">$6.30/trip ($2,300)</td>
                <td class="num"><strong>$4.69/trip ($1,323)</strong></td>
                <td class="num">$7.40/trip ($2,604.69)</td>
                <td class="num">$6.23/trip ($6,227.69)</td>
              </tr>
              <tr>
                <td>6. Driver Compensation Cost per Trip ($ / trip)</td>
                <td class="num">$6.86/trip ($2,504.67)</td>
                <td class="num">$9.92/trip ($2,796.99)</td>
                <td class="num"><strong>$6.23/trip ($2,194.00)</strong></td>
                <td class="num">$7.50/trip ($7,495.66)</td>
              </tr>
              <tr>
                <td>7. Net Profit per Trip (Recorded Ledger vs. Strict Adjusted)</td>
                <td class="num"><strong>+$7.62/trip</strong> (Adj: +$33.90)</td>
                <td class="num">-$4.88/trip (Adj: +$7.67)</td>
                <td class="num">+$0.97/trip (Adj: +$11.67)</td>
                <td class="num">+$1.75/trip (Adj: +$18.66)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Complete 172-Trip Chronological Overtime Log (TB1: 55 · Tb7: 85 · Tb9: 32)</h4>
            <div class="fpnl-sec-sub">Every trip flagged Yes ($13), Yes2 ($26), or Super ($5) across WTC and BBConstruction</div>
          </div>
          <span class="fpnl-pill br">${fmtInt(rows.length)} OT Trips · ${fmtUSD(sumPay)} Driver OT · ${fmtUSD(sumTrans)} Trans Rev</span>
        </div>
        <div class="fpnl-filter-bar">
          <input type="search" id="fpnlOtSearch" placeholder="Search date, driver, customer/supplier, site, bon #..." value="${esc(state.otSearch)}">
          <select id="fpnlOtTruck" data-freq-exempt="1">
            <option value="ALL" ${state.otTruck === 'ALL' ? 'selected' : ''}>All Trucks (172 OT Trips)</option>
            <option value="Tb7" ${state.otTruck === 'Tb7' ? 'selected' : ''}>Tb7 · 364656 (85 OT Trips)</option>
            <option value="TB1" ${state.otTruck === 'TB1' ? 'selected' : ''}>TB1 · 360676 (55 OT Trips)</option>
            <option value="Tb9" ${state.otTruck === 'Tb9' ? 'selected' : ''}>Tb9 · 364168 (32 OT Trips)</option>
          </select>
          <select id="fpnlOtDriver" data-freq-exempt="1">
            <option value="ALL" ${state.otDriver === 'ALL' ? 'selected' : ''}>All Drivers (172)</option>
            <option value="Mohamad Habib" ${state.otDriver === 'Mohamad Habib' ? 'selected' : ''}>Mohamad Habib · Tb7 (85)</option>
            <option value="Majed Karam" ${state.otDriver === 'Majed Karam' ? 'selected' : ''}>Majed Karam · TB1 (46)</option>
            <option value="Ali Saleh" ${state.otDriver === 'Ali Saleh' ? 'selected' : ''}>Ali Saleh · Tb9 (32)</option>
            <option value="Ahmad Hamoud" ${state.otDriver === 'Ahmad Hamoud' ? 'selected' : ''}>Ahmad Hamoud · TB1 (9)</option>
          </select>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Truck &amp; Driver</th>
                <th>Company &amp; Stream</th>
                <th>Customer / Supplier &amp; Site</th>
                <th>Bon #</th>
                <th class="num">Vol (m³)</th>
                <th>OT Tier</th>
                <th class="num">OT Pay ($)</th>
                <th class="num">Trip Trans Rev ($)</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${esc(r.date)}</td>
                  <td><strong>${esc(r.truck)}</strong> · ${esc(r.driver)}</td>
                  <td>${esc(r.company)} · ${esc(r.stream)}</td>
                  <td><strong>${esc(r.party)}</strong> (${esc(r.loc)})</td>
                  <td>${esc(r.bon)}</td>
                  <td class="num">${fmtNum(r.vol, 1)}</td>
                  <td><span class="fpnl-pill ${r.code === 'Yes2' ? 'am' : (r.code === 'Super' ? 'sl' : 'em')}">${esc(r.code)}</span></td>
                  <td class="num"><strong>${fmtUSD(r.pay)}</strong></td>
                  <td class="num">${fmtUSD(r.trans_usd)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="7">TOTAL FILTERED OVERTIME TRIPS (${fmtInt(rows.length)} Trips)</td>
                <td class="num">${fmtUSD(sumPay)}</td>
                <td class="num">${fmtUSD(sumTrans)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderSubTabRecon() {
    return `
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Cross-Ledger Reconciliation Audit (4 Key Findings Across WTC &amp; BBConstruction)</h4>
            <div class="fpnl-sec-sub">Critical data-integrity rules permanently enforced in this module so fleet profitability is never distorted</div>
          </div>
          <span class="fpnl-pill em">100% Reconciled</span>
        </div>
        <div class="fpnl-body">
          <div class="fpnl-callout-grid">
            ${RECON_FINDINGS.map(f => `
              <div class="fpnl-callout ${f.severity}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
                  <h5>${esc(f.num)}: ${esc(f.title)}</h5>
                  <span class="fpnl-pill ${f.severity}">${esc(f.badge)}</span>
                </div>
                <p>${esc(f.body)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderCockpitHtml(opts = {}) {
    const m = getActiveModel();
    let bodyHtml = '';
    if (state.tab === 'pnl') bodyHtml = renderSubTabPnl(m);
    else if (state.tab === 'zero') bodyHtml = renderSubTabZero();
    else if (state.tab === 'routes') bodyHtml = renderSubTabRoutes();
    else if (state.tab === 'expenses') bodyHtml = renderSubTabExpenses();
    else if (state.tab === 'overtime') bodyHtml = renderSubTabOvertime();
    else if (state.tab === 'recon') bodyHtml = renderSubTabRecon();

    const cid = opts.containerId || 'fleetRevCostCockpit';
    return `
      <section class="fpnl-cockpit" id="${esc(cid)}" data-fpnl-cockpit="1">
        <div class="fpnl-head">
          <div class="fpnl-head-left">
            <div class="fpnl-eyebrow">
              <span>BDEIR FLEET REVENUE &amp; COST AUDIT · WTC + BBCONSTRUCTION</span>
            </div>
            <h3 class="fpnl-title">Truck Fleet Revenue &amp; Cost Analysis (TB1 · 360676 | Tb7 · 364656 | Tb9 · 364168)</h3>
            <p class="fpnl-sub">Complete 2-month post-cutover profitability statement (Aug 24 - Oct 23, 2026 · 999 Trips · 28,440.2 m³), 265 Zero-Haulage ($0.00) trip leakage schedule, 108 routes explorer, de-duplicated diesel &amp; 85 repair bills, and 172 overtime trips.</p>
          </div>
          <div class="fpnl-controls">
            <div class="fpnl-scope-bar" role="group" aria-label="Analysis Scope">
              <button type="button" class="fpnl-scope-btn ${state.scope === 'cutover' ? 'on' : ''}" data-fpnl-scope="cutover">Aug 24 - Oct 23, 2026 Cutover Audit (999 Trips)</button>
              <button type="button" class="fpnl-scope-btn ${state.scope === 'live' ? 'on' : ''}" data-fpnl-scope="live">Live Active Slicer (Dynamic)</button>
            </div>
            <div class="fpnl-mode-bar" role="group" aria-label="P&L Valuation Mode">
              <button type="button" class="fpnl-mode-btn ${state.mode === 'recorded' ? 'on' : ''}" data-fpnl-mode="recorded">1. Recorded Ledger ($46,124 | Net +$1,746)</button>
              <button type="button" class="fpnl-mode-btn ${state.mode === 'strict' ? 'on' : ''}" data-fpnl-mode="strict">2. Strict Adjusted (+$16,896 | Net +$18,642)</button>
              <button type="button" class="fpnl-mode-btn ${state.mode === 'full' ? 'on' : ''}" data-fpnl-mode="full">3. Full Benchmark (+$22,828 | Net +$24,574)</button>
            </div>
          </div>
        </div>

        <div class="fpnl-subtabs" role="tablist" aria-label="Fleet Analysis Views">
          <button type="button" class="fpnl-subtab ${state.tab === 'pnl' ? 'on' : ''}" data-fpnl-tab="pnl">
            <span>1. Executive P&amp;L &amp; Scorecards</span>
            <span class="fpnl-subtab-badge">3 Trucks</span>
          </button>
          <button type="button" class="fpnl-subtab ${state.tab === 'zero' ? 'on' : ''}" data-fpnl-tab="zero">
            <span>2. Zero-Haulage ($0.00) Audit</span>
            <span class="fpnl-subtab-badge">265 Trips</span>
          </button>
          <button type="button" class="fpnl-subtab ${state.tab === 'routes' ? 'on' : ''}" data-fpnl-tab="routes">
            <span>3. All 108 Routes Explorer</span>
            <span class="fpnl-subtab-badge">999 Trips</span>
          </button>
          <button type="button" class="fpnl-subtab ${state.tab === 'expenses' ? 'on' : ''}" data-fpnl-tab="expenses">
            <span>4. Diesel De-Dup &amp; Repairs</span>
            <span class="fpnl-subtab-badge">85 Bills</span>
          </button>
          <button type="button" class="fpnl-subtab ${state.tab === 'overtime' ? 'on' : ''}" data-fpnl-tab="overtime">
            <span>5. Overtime, Payroll &amp; Benchmarks</span>
            <span class="fpnl-subtab-badge">172 OT</span>
          </button>
          <button type="button" class="fpnl-subtab ${state.tab === 'recon' ? 'on' : ''}" data-fpnl-tab="recon">
            <span>6. Cross-Ledger Reconciliation</span>
            <span class="fpnl-subtab-badge">4 Findings</span>
          </button>
        </div>

        <div class="fpnl-body">
          ${bodyHtml}
        </div>
      </section>
    `;
  }

  function wireCockpitEvents(root) {
    if (!root) return;
    const refresh = () => {
      const target = root.closest('[data-fpnl-cockpit="1"]') || document.querySelector('[data-fpnl-cockpit="1"]');
      if (!target) return;
      const cid = target.id || 'fleetRevCostCockpit';
      const activeId = document.activeElement ? document.activeElement.id : null;
      const selStart = document.activeElement && typeof document.activeElement.selectionStart === 'number' ? document.activeElement.selectionStart : null;
      target.outerHTML = renderCockpitHtml({ containerId: cid });
      const nextRoot = document.getElementById(cid);
      wireCockpitEvents(nextRoot);
      if (activeId) {
        const el = document.getElementById(activeId);
        if (el) {
          el.focus();
          if (selStart !== null && typeof el.setSelectionRange === 'function') {
            try { el.setSelectionRange(selStart, selStart); } catch (_) {}
          }
        }
      }
    };

    root.querySelectorAll('[data-fpnl-scope]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.scope = btn.getAttribute('data-fpnl-scope') || 'cutover';
        refresh();
      });
    });

    root.querySelectorAll('[data-fpnl-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.mode = btn.getAttribute('data-fpnl-mode') || 'recorded';
        refresh();
      });
    });

    root.querySelectorAll('[data-fpnl-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tab = btn.getAttribute('data-fpnl-tab') || 'pnl';
        refresh();
      });
    });

    const bindInput = (id, key, evt = 'input') => {
      const el = root.querySelector('#' + id);
      if (!el) return;
      el.addEventListener(evt, () => {
        state[key] = el.value;
        refresh();
      });
    };

    bindInput('fpnlZeroSearch', 'zeroSearch', 'input');
    bindInput('fpnlZeroStream', 'zeroStream', 'change');
    bindInput('fpnlZeroTruck', 'zeroTruck', 'change');
    bindInput('fpnlZeroCompany', 'zeroCompany', 'change');

    bindInput('fpnlRouteSearch', 'routeSearch', 'input');
    bindInput('fpnlRouteStream', 'routeStream', 'change');
    bindInput('fpnlRouteTruck', 'routeTruck', 'change');
    bindInput('fpnlRouteCompany', 'routeCompany', 'change');
    bindInput('fpnlRoutePricing', 'routePricing', 'change');

    bindInput('fpnlExpSearch', 'expSearch', 'input');
    bindInput('fpnlExpTruck', 'expTruck', 'change');
    bindInput('fpnlExpCat', 'expCat', 'change');

    bindInput('fpnlOtSearch', 'otSearch', 'input');
    bindInput('fpnlOtTruck', 'otTruck', 'change');
    bindInput('fpnlOtDriver', 'otDriver', 'change');
  }

  function mountAllCockpits() {
    document.querySelectorAll('[data-fpnl-cockpit="1"]').forEach(el => {
      wireCockpitEvents(el);
    });
  }

  window.MFG_FLEET_PNL = {
    state,
    data: CUTOVER_DATA,
    modes: CUTOVER_PNL_MODES,
    renderCockpitHtml,
    mountAllCockpits,
    openTab(tabName, modeName) {
      if (tabName) state.tab = tabName;
      if (modeName) state.mode = modeName;
      if (typeof window.navigateToView === 'function') {
        window.navigateToView('fleet_equip');
      }
      setTimeout(() => {
        const el = document.getElementById('fleetRevCostCockpit');
        if (el) {
          el.outerHTML = renderCockpitHtml({ containerId: 'fleetRevCostCockpit' });
          const next = document.getElementById('fleetRevCostCockpit');
          wireCockpitEvents(next);
          next.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
    }
  };
})();
