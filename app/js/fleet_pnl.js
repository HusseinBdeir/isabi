/* ==========================================================================
   ISABI Systems - Truck Fleet Revenue & Cost Analysis Module
   Complete Bdeir Fleet Audit (TB1, Tb7, Tb9: Aug 24 - Oct 23, 2026)
   + Prominent Specific-Truck & Multi-Truck Filter Deck + Live Fleet Engine
   ========================================================================== */
(function () {
  'use strict';

  const CUTOVER_DATA = {"sales_sites":[{"truck":"TB1","co":"BBConstruction","customer":"Sabeh Beton","site":"Choueifat","product":"Jarousha","trips":33,"paid_trips":0,"zero_trips":33,"qty":957,"unit_prices":[19.5,22],"mat_rev":20329,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-26","max_date":"2026-10-23","status":"Zero Haulage ($0 Billed)","est_missing":3828,"note":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) Delivery Rate Schedule split on BBConstruction.","site_label":"Sabeh Beton (Choueifat)","vol":957,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-10-23","status_full":"Zero Haulage ($0 Billed): Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) Delivery Rate Schedule split on BBConstruction."},{"truck":"TB1","co":"WTC","customer":"majed terro","site":"sibline","product":"Mghasal","trips":21,"paid_trips":21,"zero_trips":0,"qty":609,"unit_prices":[22.5],"mat_rev":13702.5,"trans_units":[3.5],"trans_rev":2131.5,"per_trip":101.5,"ot_trips":19,"ot_amt":184,"drivers":"Majed Karam","min_date":"2026-08-31","max_date":"2026-09-25","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($101.50/trip at $3.5/m³).","site_label":"majed terro (sibline)","vol":609,"ot_allow":184,"first_dt":"2026-08-31","last_dt":"2026-09-25","status_full":"Strong Rate ($95+/trip): High-yield long haul ($101.50/trip at $3.5/m³)."},{"truck":"TB1","co":"WTC","customer":"mega beton","site":"choueifat","product":"Mghasal","trips":19,"paid_trips":19,"zero_trips":0,"qty":551,"unit_prices":[22.5],"mat_rev":12397.5,"trans_units":[2.5],"trans_rev":1377.5,"per_trip":72.5,"ot_trips":9,"ot_amt":49,"drivers":"Majed Karam (15), Ahmad Hamoud (4)","min_date":"2026-08-27","max_date":"2026-10-11","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($72.50/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":551,"ot_allow":49,"first_dt":"2026-08-27","last_dt":"2026-10-11","status_full":"Adequate: Standard urban delivery rate ($72.50/trip at $2.5/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"majbal Al Afaq","site":"beirut","product":"ba7es","trips":7,"paid_trips":7,"zero_trips":0,"qty":273.78,"unit_prices":[10],"mat_rev":2737.8,"trans_units":[4],"trans_rev":812,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-24","max_date":"2026-10-22","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $4.0/m³).","site_label":"majbal Al Afaq (beirut)","vol":273.78,"ot_allow":0,"first_dt":"2026-09-24","last_dt":"2026-10-22","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $4.0/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"Sabeh Beton","site":"Choueifat","product":"sarek","trips":6,"paid_trips":0,"zero_trips":6,"qty":228.18,"unit_prices":[19],"mat_rev":3306,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-23","max_date":"2026-10-17","status":"Zero Haulage ($0 Billed)","est_missing":912.72,"note":"Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$152/trip) Delivery Rate Schedule split on BBConstruction.","site_label":"Sabeh Beton (Choueifat)","vol":228.18,"ot_allow":0,"first_dt":"2026-09-23","last_dt":"2026-10-17","status_full":"Zero Haulage ($0 Billed): Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$152/trip) Delivery Rate Schedule split on BBConstruction."},{"truck":"TB1","co":"BBConstruction","customer":"mohamad saab","site":"beirut","product":"Jarousha","trips":3,"paid_trips":3,"zero_trips":0,"qty":87,"unit_prices":[11],"mat_rev":1492.81,"trans_units":[116],"trans_rev":348,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-26","max_date":"2026-09-09","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $116.0/m³).","site_label":"mohamad saab (beirut)","vol":87,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-09-09","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $116.0/m³)."},{"truck":"TB1","co":"WTC","customer":"Sabeh Beton S.R.L","site":"Gisr al bacha","product":"Mghasal","trips":3,"paid_trips":3,"zero_trips":0,"qty":87,"unit_prices":[23.5],"mat_rev":2044.5,"trans_units":[2],"trans_rev":174,"per_trip":58,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-24","max_date":"2026-08-25","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"Sabeh Beton S.R.L (Gisr al bacha)","vol":87,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-08-25","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"majbal Al Afaq","site":"beirut","product":"sarek","trips":2,"paid_trips":2,"zero_trips":0,"qty":77.87,"unit_prices":[10.5],"mat_rev":817.63,"trans_units":[4],"trans_rev":232,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-10-09","max_date":"2026-10-12","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $4.0/m³).","site_label":"majbal Al Afaq (beirut)","vol":77.87,"ot_allow":0,"first_dt":"2026-10-09","last_dt":"2026-10-12","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $4.0/m³)."},{"truck":"TB1","co":"WTC","customer":"mega beton","site":"choueifat","product":"Ramel","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"unit_prices":[22],"mat_rev":1276,"trans_units":[2.5],"trans_rev":145,"per_trip":72.5,"ot_trips":2,"ot_amt":10,"drivers":"Majed Karam","min_date":"2026-09-10","max_date":"2026-09-10","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($72.50/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":58,"ot_allow":10,"first_dt":"2026-09-10","last_dt":"2026-09-10","status_full":"Adequate: Standard urban delivery rate ($72.50/trip at $2.5/m³)."},{"truck":"TB1","co":"WTC","customer":"haj ibrahim","site":"afak","product":"Mghasal","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"unit_prices":[23],"mat_rev":1334,"trans_units":[2],"trans_rev":116,"per_trip":58,"ot_trips":0,"ot_amt":0,"drivers":"Ahmad Hamoud","min_date":"2026-10-11","max_date":"2026-10-21","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"haj ibrahim (afak)","vol":58,"ot_allow":0,"first_dt":"2026-10-11","last_dt":"2026-10-21","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"Majbal Al Afaq","site":"beirut","product":"sarek","trips":1,"paid_trips":1,"zero_trips":0,"qty":39.85,"unit_prices":[10],"mat_rev":398.5,"trans_units":[4],"trans_rev":116,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-21","max_date":"2026-09-21","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $4.0/m³).","site_label":"Majbal Al Afaq (beirut)","vol":39.85,"ot_allow":0,"first_dt":"2026-09-21","last_dt":"2026-09-21","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $4.0/m³)."},{"truck":"TB1","co":"WTC","customer":"Haj Ibrahim","site":"afak","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[23],"mat_rev":638,"trans_units":[3],"trans_rev":87,"per_trip":87,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-10","max_date":"2026-09-10","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($87.00/trip at $3.0/m³).","site_label":"Haj Ibrahim (afak)","vol":29,"ot_allow":0,"first_dt":"2026-09-10","last_dt":"2026-09-10","status_full":"Adequate: Standard urban delivery rate ($87.00/trip at $3.0/m³)."},{"truck":"TB1","co":"WTC","customer":"Haj Ibrahim","site":"afak","product":"Ramel","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[20],"mat_rev":580,"trans_units":[3],"trans_rev":87,"per_trip":87,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-12","max_date":"2026-09-12","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($87.00/trip at $3.0/m³).","site_label":"Haj Ibrahim (afak)","vol":29,"ot_allow":0,"first_dt":"2026-09-12","last_dt":"2026-09-12","status_full":"Adequate: Standard urban delivery rate ($87.00/trip at $3.0/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"ARACO - Jiyeh","site":"beirut","product":"Bodra","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[9],"mat_rev":426.69,"trans_units":[3],"trans_rev":87,"per_trip":87,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-29","max_date":"2026-08-29","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($87.00/trip at $3.0/m³).","site_label":"ARACO - Jiyeh (beirut)","vol":29,"ot_allow":0,"first_dt":"2026-08-29","last_dt":"2026-08-29","status_full":"Adequate: Standard urban delivery rate ($87.00/trip at $3.0/m³)."},{"truck":"TB1","co":"WTC","customer":"sabeh beton s.r.l","site":"Gisr al bacha","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[23.5],"mat_rev":681.5,"trans_units":[2],"trans_rev":58,"per_trip":58,"ot_trips":1,"ot_amt":5,"drivers":"Ahmad Hamoud","min_date":"2026-10-17","max_date":"2026-10-17","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"sabeh beton s.r.l (Gisr al bacha)","vol":29,"ot_allow":5,"first_dt":"2026-10-17","last_dt":"2026-10-17","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"TB1","co":"WTC","customer":"SOIME choueifat","site":"choueifat","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[14],"mat_rev":678.37,"trans_units":[1.15],"trans_rev":55.72,"per_trip":55.72,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-16","max_date":"2026-09-16","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($55.72/trip at $1.15/m³).","site_label":"SOIME choueifat (choueifat)","vol":29,"ot_allow":0,"first_dt":"2026-09-16","last_dt":"2026-09-16","status_full":"Adequate: Standard urban delivery rate ($55.72/trip at $1.15/m³)."},{"truck":"TB1","co":"BBConstruction","customer":"Sabeh Beton","site":"Nahr El-Mot","product":"Jarousha","trips":1,"paid_trips":0,"zero_trips":1,"qty":29,"unit_prices":[23],"mat_rev":667,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-15","max_date":"2026-09-15","status":"Zero Haulage ($0 Billed)","est_missing":116,"note":"Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) Delivery Rate Schedule split on BBConstruction.","site_label":"Sabeh Beton (Nahr El-Mot)","vol":29,"ot_allow":0,"first_dt":"2026-09-15","last_dt":"2026-09-15","status_full":"Zero Haulage ($0 Billed): Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) Delivery Rate Schedule split on BBConstruction."},{"truck":"Tb7","co":"BBConstruction","customer":"Sabeh Beton","site":"Choueifat","product":"Jarousha","trips":45,"paid_trips":0,"zero_trips":45,"qty":1285,"unit_prices":[19.5,22],"mat_rev":27430,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-26","max_date":"2026-10-20","status":"Zero Haulage ($0 Billed)","est_missing":5140,"note":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$114/trip) Delivery Rate Schedule split on BBConstruction.","site_label":"Sabeh Beton (Choueifat)","vol":1285,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-10-20","status_full":"Zero Haulage ($0 Billed): Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$114/trip) Delivery Rate Schedule split on BBConstruction."},{"truck":"Tb7","co":"WTC","customer":"mega beton","site":"choueifat","product":"Mghasal","trips":25,"paid_trips":25,"zero_trips":0,"qty":703,"unit_prices":[22.5],"mat_rev":15817.5,"trans_units":[2.5],"trans_rev":1757.5,"per_trip":70.3,"ot_trips":11,"ot_amt":63,"drivers":"Mohamad Habib","min_date":"2026-08-24","max_date":"2026-10-10","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($70.30/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":703,"ot_allow":63,"first_dt":"2026-08-24","last_dt":"2026-10-10","status_full":"Adequate: Standard urban delivery rate ($70.30/trip at $2.5/m³)."},{"truck":"Tb7","co":"WTC","customer":"majed terro","site":"sibline","product":"Mghasal","trips":21,"paid_trips":21,"zero_trips":0,"qty":589,"unit_prices":[22.5],"mat_rev":13252.5,"trans_units":[3.5],"trans_rev":2061.5,"per_trip":98.17,"ot_trips":17,"ot_amt":164,"drivers":"Mohamad Habib","min_date":"2026-08-31","max_date":"2026-10-05","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($98.17/trip at $3.5/m³).","site_label":"majed terro (sibline)","vol":589,"ot_allow":164,"first_dt":"2026-08-31","last_dt":"2026-10-05","status_full":"Strong Rate ($95+/trip): High-yield long haul ($98.17/trip at $3.5/m³)."},{"truck":"Tb7","co":"BBConstruction","customer":"majbal Al Afaq","site":"beirut","product":"ba7es","trips":7,"paid_trips":7,"zero_trips":0,"qty":268.43,"unit_prices":[10],"mat_rev":2684.3,"trans_units":[4],"trans_rev":812,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-24","max_date":"2026-10-20","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $4.0/m³).","site_label":"majbal Al Afaq (beirut)","vol":268.43,"ot_allow":0,"first_dt":"2026-09-24","last_dt":"2026-10-20","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $4.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"mega beton","site":"choueifat","product":"Ramel","trips":6,"paid_trips":6,"zero_trips":0,"qty":168,"unit_prices":[22],"mat_rev":3696,"trans_units":[2.5],"trans_rev":420,"per_trip":70,"ot_trips":3,"ot_amt":15,"drivers":"Mohamad Habib","min_date":"2026-09-10","max_date":"2026-09-16","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($70.00/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":168,"ot_allow":15,"first_dt":"2026-09-10","last_dt":"2026-09-16","status_full":"Adequate: Standard urban delivery rate ($70.00/trip at $2.5/m³)."},{"truck":"Tb7","co":"WTC","customer":"sabeh beton s.r.l","site":"Gisr al bacha","product":"Mghasal","trips":4,"paid_trips":4,"zero_trips":0,"qty":116,"unit_prices":[23.5],"mat_rev":2726,"trans_units":[2],"trans_rev":232,"per_trip":58,"ot_trips":1,"ot_amt":5,"drivers":"Mohamad Habib","min_date":"2026-10-05","max_date":"2026-10-17","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"sabeh beton s.r.l (Gisr al bacha)","vol":116,"ot_allow":5,"first_dt":"2026-10-05","last_dt":"2026-10-17","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"sabeh beton s.r.l","site":"choueifat","product":"Mghasal","trips":4,"paid_trips":4,"zero_trips":0,"qty":116,"unit_prices":[23.5],"mat_rev":2726,"trans_units":[2],"trans_rev":232,"per_trip":58,"ot_trips":2,"ot_amt":14,"drivers":"Mohamad Habib","min_date":"2026-10-09","max_date":"2026-10-17","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"sabeh beton s.r.l (choueifat)","vol":116,"ot_allow":14,"first_dt":"2026-10-09","last_dt":"2026-10-17","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"sabeh beton s.r.l","site":"choueifat","product":"Kasara","trips":4,"paid_trips":4,"zero_trips":0,"qty":116,"unit_prices":[23.5],"mat_rev":2726,"trans_units":[2],"trans_rev":232,"per_trip":58,"ot_trips":3,"ot_amt":21,"drivers":"Mohamad Habib","min_date":"2026-10-12","max_date":"2026-10-14","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.00/trip at $2.0/m³).","site_label":"sabeh beton s.r.l (choueifat)","vol":116,"ot_allow":21,"first_dt":"2026-10-12","last_dt":"2026-10-14","status_full":"Adequate: Standard urban delivery rate ($58.00/trip at $2.0/m³)."},{"truck":"Tb7","co":"BBConstruction","customer":"Sabeh Beton","site":"Choueifat","product":"sarek","trips":4,"paid_trips":0,"zero_trips":4,"qty":149.88,"unit_prices":[19],"mat_rev":2204,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-24","max_date":"2026-10-17","status":"Zero Haulage ($0 Billed)","est_missing":599.52,"note":"Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$150/trip) Delivery Rate Schedule split on BBConstruction.","site_label":"Sabeh Beton (Choueifat)","vol":149.88,"ot_allow":0,"first_dt":"2026-09-24","last_dt":"2026-10-17","status_full":"Zero Haulage ($0 Billed): Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$150/trip) Delivery Rate Schedule split on BBConstruction."},{"truck":"Tb7","co":"WTC","customer":"SOIME choueifat","site":"choueifat","product":"Mghasal","trips":3,"paid_trips":3,"zero_trips":0,"qty":84,"unit_prices":[14],"mat_rev":1983.45,"trans_units":[1.15],"trans_rev":162.93,"per_trip":54.31,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-24","max_date":"2026-09-03","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.31/trip ($1.15/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"SOIME choueifat (choueifat)","vol":84,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-09-03","status_full":"Low Rate (<$55/trip): Earns $54.31/trip ($1.15/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb7","co":"BBConstruction","customer":"majbal Al Afaq","site":"beirut","product":"sarek","trips":2,"paid_trips":2,"zero_trips":0,"qty":75.25,"unit_prices":[10,10.5],"mat_rev":771.36,"trans_units":[4],"trans_rev":228,"per_trip":114,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-22","max_date":"2026-10-12","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($114.00/trip at $4.0/m³).","site_label":"majbal Al Afaq (beirut)","vol":75.25,"ot_allow":0,"first_dt":"2026-09-22","last_dt":"2026-10-12","status_full":"Strong Rate ($95+/trip): High-yield long haul ($114.00/trip at $4.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"soime dawra","site":"dawra","product":"Mghasal","trips":2,"paid_trips":2,"zero_trips":0,"qty":56,"unit_prices":[14],"mat_rev":1351.77,"trans_units":[1.75],"trans_rev":168.97,"per_trip":84.48,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-24","max_date":"2026-09-11","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($84.48/trip at $1.75/m³).","site_label":"soime dawra (dawra)","vol":56,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-09-11","status_full":"Adequate: Standard urban delivery rate ($84.48/trip at $1.75/m³)."},{"truck":"Tb7","co":"WTC","customer":"haj ibrahim","site":"afak","product":"Mghasal","trips":2,"paid_trips":2,"zero_trips":0,"qty":56,"unit_prices":[23],"mat_rev":1288,"trans_units":[2],"trans_rev":112,"per_trip":56,"ot_trips":2,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-26","max_date":"2026-09-26","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($56.00/trip at $2.0/m³).","site_label":"haj ibrahim (afak)","vol":56,"ot_allow":0,"first_dt":"2026-09-26","last_dt":"2026-09-26","status_full":"Adequate: Standard urban delivery rate ($56.00/trip at $2.0/m³)."},{"truck":"Tb7","co":"BBConstruction","customer":"Sabeh Beton","site":"Nahr El-Mot","product":"Jarousha","trips":2,"paid_trips":0,"zero_trips":2,"qty":56,"unit_prices":[23],"mat_rev":1288,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-14","max_date":"2026-09-15","status":"Zero Haulage ($0 Billed)","est_missing":224,"note":"Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$112/trip) Delivery Rate Schedule split on BBConstruction.","site_label":"Sabeh Beton (Nahr El-Mot)","vol":56,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-15","status_full":"Zero Haulage ($0 Billed): Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$112/trip) Delivery Rate Schedule split on BBConstruction."},{"truck":"Tb7","co":"BBConstruction","customer":"ARACO - Jiyeh","site":"Choueifat","product":"sarek","trips":1,"paid_trips":1,"zero_trips":0,"qty":37.6,"unit_prices":[10.5],"mat_rev":394.8,"trans_units":[4],"trans_rev":116,"per_trip":116,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-10-07","max_date":"2026-10-07","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($116.00/trip at $4.0/m³).","site_label":"ARACO - Jiyeh (Choueifat)","vol":37.6,"ot_allow":0,"first_dt":"2026-10-07","last_dt":"2026-10-07","status_full":"Strong Rate ($95+/trip): High-yield long haul ($116.00/trip at $4.0/m³)."},{"truck":"Tb7","co":"BBConstruction","customer":"Embassy of Kuwait","site":"beirut","product":"Bodra","trips":1,"paid_trips":1,"zero_trips":0,"qty":47.16,"unit_prices":[9.5],"mat_rev":448,"trans_units":[0],"trans_rev":108,"per_trip":108,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-10-10","max_date":"2026-10-10","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($108.00/trip at $0.0/m³).","site_label":"Embassy of Kuwait (beirut)","vol":47.16,"ot_allow":0,"first_dt":"2026-10-10","last_dt":"2026-10-10","status_full":"Strong Rate ($95+/trip): High-yield long haul ($108.00/trip at $0.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"Haj Ibrahim","site":"afak","product":"Ramel","trips":1,"paid_trips":1,"zero_trips":0,"qty":28,"unit_prices":[20],"mat_rev":560,"trans_units":[3],"trans_rev":84,"per_trip":84,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-16","max_date":"2026-09-16","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($84.00/trip at $3.0/m³).","site_label":"Haj Ibrahim (afak)","vol":28,"ot_allow":0,"first_dt":"2026-09-16","last_dt":"2026-09-16","status_full":"Adequate: Standard urban delivery rate ($84.00/trip at $3.0/m³)."},{"truck":"Tb7","co":"BBConstruction","customer":"ARACO - Jiyeh","site":"beirut","product":"Bodra","trips":1,"paid_trips":1,"zero_trips":0,"qty":28,"unit_prices":[9],"mat_rev":412.47,"trans_units":[3],"trans_rev":84,"per_trip":84,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-29","max_date":"2026-08-29","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($84.00/trip at $3.0/m³).","site_label":"ARACO - Jiyeh (beirut)","vol":28,"ot_allow":0,"first_dt":"2026-08-29","last_dt":"2026-08-29","status_full":"Adequate: Standard urban delivery rate ($84.00/trip at $3.0/m³)."},{"truck":"Tb7","co":"WTC","customer":"soime choueifat","site":"choueifat","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":29,"unit_prices":[14.5],"mat_rev":713.62,"trans_units":[1.25],"trans_rev":61.52,"per_trip":61.52,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-10-21","max_date":"2026-10-21","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($61.52/trip at $1.25/m³).","site_label":"soime choueifat (choueifat)","vol":29,"ot_allow":0,"first_dt":"2026-10-21","last_dt":"2026-10-21","status_full":"Adequate: Standard urban delivery rate ($61.52/trip at $1.25/m³)."},{"truck":"Tb7","co":"WTC","customer":"majbal rayan","site":"choueifat","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":28,"unit_prices":[24],"mat_rev":672,"trans_units":[2],"trans_rev":56,"per_trip":56,"ot_trips":1,"ot_amt":5,"drivers":"Mohamad Habib","min_date":"2026-09-13","max_date":"2026-09-13","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($56.00/trip at $2.0/m³).","site_label":"majbal rayan (choueifat)","vol":28,"ot_allow":5,"first_dt":"2026-09-13","last_dt":"2026-09-13","status_full":"Adequate: Standard urban delivery rate ($56.00/trip at $2.0/m³)."},{"truck":"Tb9","co":"WTC","customer":"mega beton","site":"choueifat","product":"Mghasal","trips":49,"paid_trips":49,"zero_trips":0,"qty":1323,"unit_prices":[22.5],"mat_rev":29767.5,"trans_units":[2.5],"trans_rev":3307.5,"per_trip":67.5,"ot_trips":19,"ot_amt":119,"drivers":"Ali Saleh","min_date":"2026-08-24","max_date":"2026-10-17","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($67.50/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":1323,"ot_allow":119,"first_dt":"2026-08-24","last_dt":"2026-10-17","status_full":"Adequate: Standard urban delivery rate ($67.50/trip at $2.5/m³)."},{"truck":"Tb9","co":"WTC","customer":"soime choueifat","site":"choueifat","product":"Mghasal","trips":22,"paid_trips":22,"zero_trips":0,"qty":594,"unit_prices":[14,14.5],"mat_rev":14683.18,"trans_units":[1.15,1.25],"trans_rev":1257.85,"per_trip":57.17,"ot_trips":1,"ot_amt":7,"drivers":"Ali Saleh","min_date":"2026-09-10","max_date":"2026-10-22","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($57.17/trip at $1.15/m³).","site_label":"soime choueifat (choueifat)","vol":594,"ot_allow":7,"first_dt":"2026-09-10","last_dt":"2026-10-22","status_full":"Adequate: Standard urban delivery rate ($57.17/trip at $1.15/m³)."},{"truck":"Tb9","co":"WTC","customer":"sabeh beton s.r.l","site":"Gisr al bacha","product":"Mghasal","trips":8,"paid_trips":8,"zero_trips":0,"qty":216,"unit_prices":[23.5],"mat_rev":5076,"trans_units":[2],"trans_rev":432,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-06","max_date":"2026-10-22","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"sabeh beton s.r.l (Gisr al bacha)","vol":216,"ot_allow":0,"first_dt":"2026-10-06","last_dt":"2026-10-22","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"mega beton","site":"choueifat","product":"Kasara","trips":6,"paid_trips":6,"zero_trips":0,"qty":162,"unit_prices":[22.5,23],"mat_rev":3658.5,"trans_units":[2.5],"trans_rev":405,"per_trip":67.5,"ot_trips":3,"ot_amt":21,"drivers":"Ali Saleh","min_date":"2026-09-22","max_date":"2026-10-22","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($67.50/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":162,"ot_allow":21,"first_dt":"2026-09-22","last_dt":"2026-10-22","status_full":"Adequate: Standard urban delivery rate ($67.50/trip at $2.5/m³)."},{"truck":"Tb9","co":"WTC","customer":"SOIME choueifat","site":"choueifat","product":"Mghasal","trips":6,"paid_trips":6,"zero_trips":0,"qty":162,"unit_prices":[14],"mat_rev":3864,"trans_units":[1.15],"trans_rev":317.4,"per_trip":52.9,"ot_trips":1,"ot_amt":5,"drivers":"Ali Saleh","min_date":"2026-08-28","max_date":"2026-09-16","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $52.90/trip ($1.15/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"SOIME choueifat (choueifat)","vol":162,"ot_allow":5,"first_dt":"2026-08-28","last_dt":"2026-09-16","status_full":"Low Rate (<$55/trip): Earns $52.90/trip ($1.15/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"BBConstruction","customer":"Sabeh Beton","site":"Choueifat","product":"Jarousha","trips":5,"paid_trips":0,"zero_trips":5,"qty":135,"unit_prices":[19.5,22],"mat_rev":2835,"trans_units":[0],"trans_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-28","max_date":"2026-10-13","status":"Zero Haulage ($0 Billed)","est_missing":540,"note":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$108/trip) Delivery Rate Schedule split on BBConstruction.","site_label":"Sabeh Beton (Choueifat)","vol":135,"ot_allow":0,"first_dt":"2026-08-28","last_dt":"2026-10-13","status_full":"Zero Haulage ($0 Billed): Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$108/trip) Delivery Rate Schedule split on BBConstruction."},{"truck":"Tb9","co":"BBConstruction","customer":"majbal Al Afaq","site":"beirut","product":"ba7es","trips":4,"paid_trips":4,"zero_trips":0,"qty":151.18,"unit_prices":[10],"mat_rev":1511.8,"trans_units":[4],"trans_rev":432,"per_trip":108,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-24","max_date":"2026-10-22","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($108.00/trip at $4.0/m³).","site_label":"majbal Al Afaq (beirut)","vol":151.18,"ot_allow":0,"first_dt":"2026-09-24","last_dt":"2026-10-22","status_full":"Strong Rate ($95+/trip): High-yield long haul ($108.00/trip at $4.0/m³)."},{"truck":"Tb9","co":"WTC","customer":"soime dawra","site":"dawra","product":"Mghasal","trips":4,"paid_trips":4,"zero_trips":0,"qty":108,"unit_prices":[14,14.5],"mat_rev":2609.6,"trans_units":[1.75,1.9],"trans_rev":334.19,"per_trip":83.55,"ot_trips":2,"ot_amt":10,"drivers":"Ali Saleh","min_date":"2026-09-03","max_date":"2026-09-25","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($83.55/trip at $1.75/m³).","site_label":"soime dawra (dawra)","vol":108,"ot_allow":10,"first_dt":"2026-09-03","last_dt":"2026-09-25","status_full":"Adequate: Standard urban delivery rate ($83.55/trip at $1.75/m³)."},{"truck":"Tb9","co":"WTC","customer":"Haj Ibrahim","site":"afak","product":"Ramel","trips":4,"paid_trips":4,"zero_trips":0,"qty":108,"unit_prices":[20],"mat_rev":2160,"trans_units":[3],"trans_rev":324,"per_trip":81,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-12","max_date":"2026-09-15","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($81.00/trip at $3.0/m³).","site_label":"Haj Ibrahim (afak)","vol":108,"ot_allow":0,"first_dt":"2026-09-12","last_dt":"2026-09-15","status_full":"Adequate: Standard urban delivery rate ($81.00/trip at $3.0/m³)."},{"truck":"Tb9","co":"WTC","customer":"safara","site":"choueifat","product":"Mghasal","trips":4,"paid_trips":4,"zero_trips":0,"qty":108,"unit_prices":[23,24],"mat_rev":2538,"trans_units":[2],"trans_rev":216,"per_trip":54,"ot_trips":1,"ot_amt":5,"drivers":"Ali Saleh","min_date":"2026-08-29","max_date":"2026-10-09","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"safara (choueifat)","vol":108,"ot_allow":5,"first_dt":"2026-08-29","last_dt":"2026-10-09","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"sabeh beton s.r.l","site":"Gisr al bacha","product":"Kasara","trips":4,"paid_trips":4,"zero_trips":0,"qty":108,"unit_prices":[23.5],"mat_rev":2538,"trans_units":[2],"trans_rev":216,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-13","max_date":"2026-10-16","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"sabeh beton s.r.l (Gisr al bacha)","vol":108,"ot_allow":0,"first_dt":"2026-10-13","last_dt":"2026-10-16","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"majbal rayan","site":"choueifat","product":"Mghasal","trips":3,"paid_trips":3,"zero_trips":0,"qty":81,"unit_prices":[24],"mat_rev":1944,"trans_units":[2],"trans_rev":162,"per_trip":54,"ot_trips":1,"ot_amt":7,"drivers":"Ali Saleh","min_date":"2026-09-17","max_date":"2026-09-23","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"majbal rayan (choueifat)","vol":81,"ot_allow":7,"first_dt":"2026-09-17","last_dt":"2026-09-23","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"sabeh beton s.r.l","site":"choueifat","product":"Mghasal","trips":3,"paid_trips":3,"zero_trips":0,"qty":81,"unit_prices":[23.5],"mat_rev":1903.5,"trans_units":[2],"trans_rev":162,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-09","max_date":"2026-10-19","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"sabeh beton s.r.l (choueifat)","vol":81,"ot_allow":0,"first_dt":"2026-10-09","last_dt":"2026-10-19","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"haj ali","site":"hazmeih","product":"soil","trips":2,"paid_trips":2,"zero_trips":0,"qty":54,"unit_prices":[6],"mat_rev":340,"trans_units":[100],"trans_rev":200,"per_trip":100,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-04","max_date":"2026-09-07","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($100.00/trip at $100.0/m³).","site_label":"haj ali (hazmeih)","vol":54,"ot_allow":0,"first_dt":"2026-09-04","last_dt":"2026-09-07","status_full":"Strong Rate ($95+/trip): High-yield long haul ($100.00/trip at $100.0/m³)."},{"truck":"Tb9","co":"WTC","customer":"mega beton","site":"choueifat","product":"Ramel","trips":2,"paid_trips":2,"zero_trips":0,"qty":54,"unit_prices":[22],"mat_rev":1188,"trans_units":[2.5],"trans_rev":135,"per_trip":67.5,"ot_trips":2,"ot_amt":10,"drivers":"Ali Saleh","min_date":"2026-09-10","max_date":"2026-09-11","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($67.50/trip at $2.5/m³).","site_label":"mega beton (choueifat)","vol":54,"ot_allow":10,"first_dt":"2026-09-10","last_dt":"2026-09-11","status_full":"Adequate: Standard urban delivery rate ($67.50/trip at $2.5/m³)."},{"truck":"Tb9","co":"WTC","customer":"william nasar","site":"Burj Al Barajneh","product":"Mghasal","trips":2,"paid_trips":2,"zero_trips":0,"qty":54,"unit_prices":[22],"mat_rev":1192,"trans_units":[2],"trans_rev":108,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-24","max_date":"2026-09-01","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"william nasar (Burj Al Barajneh)","vol":54,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-09-01","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"sabeh beton s.r.l","site":"choueifat","product":"Kasara","trips":2,"paid_trips":2,"zero_trips":0,"qty":54,"unit_prices":[23.5],"mat_rev":1269,"trans_units":[2],"trans_rev":108,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-15","max_date":"2026-10-15","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"sabeh beton s.r.l (choueifat)","vol":54,"ot_allow":0,"first_dt":"2026-10-15","last_dt":"2026-10-15","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"haj ibrahim","site":"afak","product":"Mghasal","trips":2,"paid_trips":2,"zero_trips":0,"qty":54,"unit_prices":[23],"mat_rev":1242,"trans_units":[2],"trans_rev":108,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-17","max_date":"2026-10-23","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"haj ibrahim (afak)","vol":54,"ot_allow":0,"first_dt":"2026-10-17","last_dt":"2026-10-23","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"Jad Bdeir","site":"al jawad","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"unit_prices":[0],"mat_rev":0,"trans_units":[5],"trans_rev":135,"per_trip":135,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-12","max_date":"2026-09-12","status":"Strong Rate ($95+/trip)","est_missing":0,"note":"High-yield long haul ($135.00/trip at $5.0/m³).","site_label":"Jad Bdeir (al jawad)","vol":27,"ot_allow":0,"first_dt":"2026-09-12","last_dt":"2026-09-12","status_full":"Strong Rate ($95+/trip): High-yield long haul ($135.00/trip at $5.0/m³)."},{"truck":"Tb9","co":"WTC","customer":"SOIme choueifat","site":"choueifat","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"unit_prices":[14.5],"mat_rev":687.08,"trans_units":[1.25],"trans_rev":59.23,"per_trip":59.23,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-29","max_date":"2026-09-29","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($59.23/trip at $1.25/m³).","site_label":"SOIme choueifat (choueifat)","vol":27,"ot_allow":0,"first_dt":"2026-09-29","last_dt":"2026-09-29","status_full":"Adequate: Standard urban delivery rate ($59.23/trip at $1.25/m³)."},{"truck":"Tb9","co":"WTC","customer":"SOIME CHOUEIFAT","site":"choueifat","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"unit_prices":[14.5],"mat_rev":681.07,"trans_units":[1.25],"trans_rev":58.71,"per_trip":58.71,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-30","max_date":"2026-09-30","status":"Adequate","est_missing":0,"note":"Standard urban delivery rate ($58.71/trip at $1.25/m³).","site_label":"SOIME CHOUEIFAT (choueifat)","vol":27,"ot_allow":0,"first_dt":"2026-09-30","last_dt":"2026-09-30","status_full":"Adequate: Standard urban delivery rate ($58.71/trip at $1.25/m³)."},{"truck":"Tb9","co":"WTC","customer":"Sabeh Beton S.R.L","site":"Gisr al bacha","product":"Mghasal","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"unit_prices":[23.5],"mat_rev":634.5,"trans_units":[2],"trans_rev":54,"per_trip":54,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-25","max_date":"2026-08-25","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"Sabeh Beton S.R.L (Gisr al bacha)","vol":27,"ot_allow":0,"first_dt":"2026-08-25","last_dt":"2026-08-25","status_full":"Low Rate (<$55/trip): Earns $54.00/trip ($2.0/m³); tight margin after ~18-22L diesel + driver cost."},{"truck":"Tb9","co":"WTC","customer":"nabih el asaad","site":"Ouzaii","product":"Mghasal 2","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"unit_prices":[21],"mat_rev":567,"trans_units":[1],"trans_rev":27,"per_trip":27,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-22","max_date":"2026-09-22","status":"Low Rate (<$55/trip)","est_missing":0,"note":"Earns $27.00/trip ($1.0/m³); tight margin after ~18-22L diesel + driver cost.","site_label":"nabih el asaad (Ouzaii)","vol":27,"ot_allow":0,"first_dt":"2026-09-22","last_dt":"2026-09-22","status_full":"Low Rate (<$55/trip): Earns $27.00/trip ($1.0/m³); tight margin after ~18-22L diesel + driver cost."}],"raw_sites":[{"truck":"TB1","co":"WTC","site":"Al Jawad","supplier":"Hussein Hamdan","product":"Ramel Mrml","region":"Excluded","trips":89,"paid_trips":89,"zero_trips":0,"qty":2581,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":4450,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam (62), Ahmad Hamoud (25), Mohamad Habib (2)","min_date":"2026-09-07","max_date":"2026-10-23","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Al Jawad (Hussein Hamdan)","vol":2581,"trans_rev":4450,"ot_allow":0,"first_dt":"2026-09-07","last_dt":"2026-10-23","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"TB1","co":"WTC","site":"Spinneys Mar Elias","supplier":"Ebco Bitar","product":"Ramel Mrml","region":"spinneys Mar Elias","trips":32,"paid_trips":27,"zero_trips":5,"qty":928,"zero_qty":145,"mat_cost":0,"trans_units":[0,50],"haul_rev":1350,"per_trip":42.19,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam (30), Ahmad Hamoud (2)","min_date":"2026-08-31","max_date":"2026-10-06","status":"Partial $0 (5 of 32 trips $0)","est_missing":250,"note":"5 of 32 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","zero_dates":["2026-08-31"],"site_label":"Spinneys Mar Elias (Ebco Bitar)","vol":928,"trans_rev":1350,"ot_allow":0,"first_dt":"2026-08-31","last_dt":"2026-10-06","status_full":"Partial $0 (5 of 32 trips $0): 5 of 32 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip."},{"truck":"TB1","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Dabsh","region":"Excluded","trips":26,"paid_trips":0,"zero_trips":26,"qty":754,"zero_qty":754,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-23","max_date":"2026-10-20","status":"No BBC Rule ($0 Haulage)","est_missing":1300,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (26 trips of Dabsh = $0; benchmark $1,300.00 at $50/trip).","zero_dates":["2026-09-23","2026-09-26","2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02","2026-10-06","2026-10-07","2026-10-09","2026-10-10","2026-10-12","2026-10-15","2026-10-16","2026-10-17","2026-10-20"],"site_label":"Al Jawad (Aljawad)","vol":754,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-23","last_dt":"2026-10-20","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (26 trips of Dabsh = $0; benchmark $1,300.00 at $50/trip)."},{"truck":"TB1","co":"WTC","site":"Sibline","supplier":"Sibline","product":"Radm","region":"Sibline","trips":25,"paid_trips":25,"zero_trips":0,"qty":725,"zero_qty":0,"mat_cost":0,"trans_units":[80],"haul_rev":2000,"per_trip":80,"ot_trips":24,"ot_amt":240,"drivers":"Majed Karam (12), Ahmad Hamoud (12), Mohamad Habib (1)","min_date":"2026-10-01","max_date":"2026-10-23","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $80/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Sibline","vol":725,"trans_rev":2000,"ot_allow":240,"first_dt":"2026-10-01","last_dt":"2026-10-23","status_full":"Strong Rate ($80/trip): Flat rate $80/truck via WTC Hauler Rate Schedule."},{"truck":"TB1","co":"BBConstruction","site":"WTC","supplier":"wtc","product":"Dabsh","region":"Excluded","trips":21,"paid_trips":0,"zero_trips":21,"qty":601,"zero_qty":601,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-24","max_date":"2026-10-20","status":"Inter-Plant Haul ($0 Haulage)","est_missing":1442.4,"note":"Hauling Dabsh from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (21 trips = $0; $1,442.40 at $2.40/m³).","zero_dates":["2026-08-24","2026-08-25","2026-08-26","2026-08-31","2026-09-03","2026-09-04","2026-09-05","2026-09-07","2026-09-08","2026-09-09","2026-09-12","2026-09-18","2026-09-20","2026-09-30","2026-10-03","2026-10-19","2026-10-20"],"site_label":"WTC","vol":601,"trans_rev":0,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-10-20","status_full":"Inter-Plant Haul ($0 Haulage): Hauling Dabsh from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (21 trips = $0; $1,442.40 at $2.40/m³)."},{"truck":"TB1","co":"BBConstruction","site":"Wael El Haj","supplier":"Wael el Haj","product":"Trab Mrml","region":"Excluded","trips":14,"paid_trips":0,"zero_trips":14,"qty":406,"zero_qty":406,"mat_cost":2030,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-26","max_date":"2026-09-03","status":"Formula Bug ($0 Haulage)","est_missing":1624,"note":"BBC Hauler Rate Schedule idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in Truck Ownership Log, and omitted Hussein Bdeir. Missing $1,624.00.","zero_dates":["2026-08-26","2026-08-28","2026-09-01","2026-09-02","2026-09-03"],"site_label":"Wael El Haj","vol":406,"trans_rev":0,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-09-03","status_full":"Formula Bug ($0 Haulage): BBC Hauler Rate Schedule idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in Truck Ownership Log, and omitted Hussein Bdeir. Missing $1,624.00."},{"truck":"TB1","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"Ramel Mrml","region":"Excluded","trips":10,"paid_trips":10,"zero_trips":0,"qty":290,"zero_qty":0,"mat_cost":1740,"trans_units":[50],"haul_rev":500,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-03","max_date":"2026-09-29","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Ali Klait","vol":290,"trans_rev":500,"ot_allow":0,"first_dt":"2026-09-03","last_dt":"2026-09-29","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"TB1","co":"WTC","site":"Elias Hassan","supplier":"Elias Hassan","product":"Ramel Mrml","region":"Excluded","trips":7,"paid_trips":7,"zero_trips":0,"qty":203,"zero_qty":0,"mat_cost":675,"trans_units":[50],"haul_rev":350,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-16","max_date":"2026-09-21","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Elias Hassan","vol":203,"trans_rev":350,"ot_allow":0,"first_dt":"2026-09-16","last_dt":"2026-09-21","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"TB1","co":"WTC","site":"Radwan Sidani","supplier":"Radwan Sidani","product":"Ramel Mrml","region":"Mar Elias","trips":7,"paid_trips":6,"zero_trips":1,"qty":203,"zero_qty":29,"mat_cost":0,"trans_units":[0,50],"haul_rev":300,"per_trip":42.86,"ot_trips":0,"ot_amt":0,"drivers":"Ahmad Hamoud (4), Majed Karam (3)","min_date":"2026-08-24","max_date":"2026-10-07","status":"Partial $0 (1 of 7 trips $0)","est_missing":50,"note":"1 of 7 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","zero_dates":["2026-08-24"],"site_label":"Radwan Sidani","vol":203,"trans_rev":300,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-10-07","status_full":"Partial $0 (1 of 7 trips $0): 1 of 7 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip."},{"truck":"TB1","co":"BBConstruction","site":"WTC","supplier":"wtc","product":"Raml Bab Thani","region":"Excluded","trips":6,"paid_trips":0,"zero_trips":6,"qty":174,"zero_qty":174,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-10-13","max_date":"2026-10-19","status":"Inter-Plant Haul ($0 Haulage)","est_missing":417.6,"note":"Hauling Raml Bab Thani from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (6 trips = $0; $417.60 at $2.40/m³).","zero_dates":["2026-10-13","2026-10-14","2026-10-19"],"site_label":"WTC","vol":174,"trans_rev":0,"ot_allow":0,"first_dt":"2026-10-13","last_dt":"2026-10-19","status_full":"Inter-Plant Haul ($0 Haulage): Hauling Raml Bab Thani from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (6 trips = $0; $417.60 at $2.40/m³)."},{"truck":"TB1","co":"WTC","site":"Sibline","supplier":"Sibline","product":"Ramel Mrml","region":"Sibline","trips":5,"paid_trips":0,"zero_trips":5,"qty":145,"zero_qty":145,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":5,"ot_amt":50,"drivers":"Ahmad Hamoud","min_date":"2026-10-12","max_date":"2026-10-12","status":"Missing Product Rule ($0 Haulage)","est_missing":400,"note":"WTC Hauler Rate Schedule $80/truck rule for Sibline only covers Product='Radm', so 5 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $400.00.","zero_dates":["2026-10-12"],"site_label":"Sibline","vol":145,"trans_rev":0,"ot_allow":50,"first_dt":"2026-10-12","last_dt":"2026-10-12","status_full":"Missing Product Rule ($0 Haulage): WTC Hauler Rate Schedule $80/truck rule for Sibline only covers Product='Radm', so 5 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $400.00."},{"truck":"TB1","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Ramel Mrml","region":"Excluded","trips":5,"paid_trips":0,"zero_trips":5,"qty":145,"zero_qty":145,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-14","max_date":"2026-09-24","status":"No BBC Rule ($0 Haulage)","est_missing":250,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (5 trips of Ramel Mrml = $0; benchmark $250.00 at $50/trip).","zero_dates":["2026-09-14","2026-09-15","2026-09-16","2026-09-17","2026-09-24"],"site_label":"Al Jawad (Aljawad)","vol":145,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-24","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (5 trips of Ramel Mrml = $0; benchmark $250.00 at $50/trip)."},{"truck":"TB1","co":"WTC","site":"Ibrahim Bdeir Aawkar","supplier":"Haj Ibrahim","product":"Ramel Mrml","region":"Excluded","trips":3,"paid_trips":3,"zero_trips":0,"qty":87,"zero_qty":0,"mat_cost":150,"trans_units":[120],"haul_rev":360,"per_trip":120,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-08-26","max_date":"2026-08-28","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $120/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Ibrahim Bdeir Aawkar (Haj Ibrahim)","vol":87,"trans_rev":360,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-08-28","status_full":"Strong Rate ($80/trip): Flat rate $120/truck via WTC Hauler Rate Schedule."},{"truck":"TB1","co":"WTC","site":"Al Jnah","supplier":"Hassib Ibrahim","product":"Ramel Mrml","region":"Excluded","trips":3,"paid_trips":3,"zero_trips":0,"qty":87,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":150,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-10","max_date":"2026-09-10","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Al Jnah (Hassib Ibrahim)","vol":87,"trans_rev":150,"ot_allow":0,"first_dt":"2026-09-10","last_dt":"2026-09-10","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"TB1","co":"WTC","site":"Sabeh Beton","supplier":"sabeh beton","product":"Radm","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"zero_qty":0,"mat_cost":-90,"trans_units":[75],"haul_rev":150,"per_trip":75,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-14","max_date":"2026-09-24","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $75/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Sabeh Beton","vol":58,"trans_rev":150,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-24","status_full":"Strong Rate ($80/trip): Flat rate $75/truck via WTC Hauler Rate Schedule."},{"truck":"TB1","co":"WTC","site":"Radm Spinneys","supplier":"Haj Ali Bdeir","product":"Ramel Mrml","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":100,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-08","max_date":"2026-09-08","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Radm Spinneys (Haj Ali Bdeir)","vol":58,"trans_rev":100,"ot_allow":0,"first_dt":"2026-09-08","last_dt":"2026-09-08","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"TB1","co":"WTC","site":"Elias Hassan","supplier":"Elias Hassan","product":"Radm","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"zero_qty":0,"mat_cost":-100,"trans_units":[50],"haul_rev":100,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-18","max_date":"2026-09-18","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Elias Hassan","vol":58,"trans_rev":100,"ot_allow":0,"first_dt":"2026-09-18","last_dt":"2026-09-18","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"TB1","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"SAND","region":"Excluded","trips":1,"paid_trips":0,"zero_trips":1,"qty":29,"zero_qty":29,"mat_cost":435,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Majed Karam","min_date":"2026-09-14","max_date":"2026-09-14","status":"Missing Product Rule ($0 Haulage)","est_missing":50,"note":"WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 1 loads of 'SAND' got $0. Missing $50.00.","zero_dates":["2026-09-14"],"site_label":"Ali Klait","vol":29,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-14","status_full":"Missing Product Rule ($0 Haulage): WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 1 loads of 'SAND' got $0. Missing $50.00."},{"truck":"Tb7","co":"WTC","site":"Al Jawad","supplier":"Hussein Hamdan","product":"Ramel Mrml","region":"Excluded","trips":44,"paid_trips":44,"zero_trips":0,"qty":1244,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":2200,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-08","max_date":"2026-10-22","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Al Jawad (Hussein Hamdan)","vol":1244,"trans_rev":2200,"ot_allow":0,"first_dt":"2026-09-08","last_dt":"2026-10-22","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"Tb7","co":"WTC","site":"Sibline","supplier":"Sibline","product":"Radm","region":"Sibline","trips":32,"paid_trips":32,"zero_trips":0,"qty":922,"zero_qty":0,"mat_cost":0,"trans_units":[80],"haul_rev":2560,"per_trip":80,"ot_trips":30,"ot_amt":300,"drivers":"Mohamad Habib","min_date":"2026-10-01","max_date":"2026-10-23","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $80/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Sibline","vol":922,"trans_rev":2560,"ot_allow":300,"first_dt":"2026-10-01","last_dt":"2026-10-23","status_full":"Strong Rate ($80/trip): Flat rate $80/truck via WTC Hauler Rate Schedule."},{"truck":"Tb7","co":"BBConstruction","site":"WTC","supplier":"wtc","product":"Dabsh","region":"Excluded","trips":13,"paid_trips":0,"zero_trips":13,"qty":365,"zero_qty":365,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-26","max_date":"2026-09-24","status":"Inter-Plant Haul ($0 Haulage)","est_missing":876,"note":"Hauling Dabsh from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (13 trips = $0; $876.00 at $2.40/m³).","zero_dates":["2026-08-26","2026-09-07","2026-09-08","2026-09-09","2026-09-11","2026-09-12","2026-09-14","2026-09-17","2026-09-21","2026-09-24"],"site_label":"WTC","vol":365,"trans_rev":0,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-09-24","status_full":"Inter-Plant Haul ($0 Haulage): Hauling Dabsh from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (13 trips = $0; $876.00 at $2.40/m³)."},{"truck":"Tb7","co":"WTC","site":"Sibline","supplier":"Sibline","product":"Ramel Mrml","region":"Sibline","trips":11,"paid_trips":0,"zero_trips":11,"qty":319,"zero_qty":319,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":11,"ot_amt":110,"drivers":"Mohamad Habib","min_date":"2026-10-12","max_date":"2026-10-12","status":"Missing Product Rule ($0 Haulage)","est_missing":880,"note":"WTC Hauler Rate Schedule $80/truck rule for Sibline only covers Product='Radm', so 11 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $880.00.","zero_dates":["2026-10-12"],"site_label":"Sibline","vol":319,"trans_rev":0,"ot_allow":110,"first_dt":"2026-10-12","last_dt":"2026-10-12","status_full":"Missing Product Rule ($0 Haulage): WTC Hauler Rate Schedule $80/truck rule for Sibline only covers Product='Radm', so 11 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $880.00."},{"truck":"Tb7","co":"BBConstruction","site":"Wael El Haj","supplier":"Wael el Haj","product":"Trab Mrml","region":"Excluded","trips":11,"paid_trips":0,"zero_trips":11,"qty":308,"zero_qty":308,"mat_cost":1540,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-26","max_date":"2026-09-02","status":"Formula Bug ($0 Haulage)","est_missing":1232,"note":"BBC Hauler Rate Schedule idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in Truck Ownership Log, and omitted Hussein Bdeir. Missing $1,232.00.","zero_dates":["2026-08-26","2026-08-28","2026-09-01","2026-09-02"],"site_label":"Wael El Haj","vol":308,"trans_rev":0,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-09-02","status_full":"Formula Bug ($0 Haulage): BBC Hauler Rate Schedule idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in Truck Ownership Log, and omitted Hussein Bdeir. Missing $1,232.00."},{"truck":"Tb7","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Dabsh","region":"Excluded","trips":11,"paid_trips":0,"zero_trips":11,"qty":319,"zero_qty":319,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-30","max_date":"2026-10-22","status":"No BBC Rule ($0 Haulage)","est_missing":550,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (11 trips of Dabsh = $0; benchmark $550.00 at $50/trip).","zero_dates":["2026-09-30","2026-10-01","2026-10-03","2026-10-06","2026-10-07","2026-10-09","2026-10-15","2026-10-17","2026-10-22"],"site_label":"Al Jawad (Aljawad)","vol":319,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-30","last_dt":"2026-10-22","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (11 trips of Dabsh = $0; benchmark $550.00 at $50/trip)."},{"truck":"Tb7","co":"WTC","site":"Spinneys Mar Elias","supplier":"Ebco Bitar","product":"Ramel Mrml","region":"spinneys Mar Elias","trips":5,"paid_trips":5,"zero_trips":0,"qty":142,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":250,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-10","max_date":"2026-10-08","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Spinneys Mar Elias (Ebco Bitar)","vol":142,"trans_rev":250,"ot_allow":0,"first_dt":"2026-09-10","last_dt":"2026-10-08","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"Tb7","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Ramel Mrml","region":"Excluded","trips":4,"paid_trips":0,"zero_trips":4,"qty":113,"zero_qty":113,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-14","max_date":"2026-09-24","status":"No BBC Rule ($0 Haulage)","est_missing":200,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (4 trips of Ramel Mrml = $0; benchmark $200.00 at $50/trip).","zero_dates":["2026-09-14","2026-09-15","2026-09-16","2026-09-24"],"site_label":"Al Jawad (Aljawad)","vol":113,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-24","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (4 trips of Ramel Mrml = $0; benchmark $200.00 at $50/trip)."},{"truck":"Tb7","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"Ramel Mrml","region":"Excluded","trips":3,"paid_trips":1,"zero_trips":2,"qty":82,"zero_qty":54,"mat_cost":492,"trans_units":[0,50],"haul_rev":50,"per_trip":16.67,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-03","max_date":"2026-09-15","status":"Partial $0 (2 of 3 trips $0)","est_missing":100,"note":"2 of 3 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","zero_dates":["2026-09-03"],"site_label":"Ali Klait","vol":82,"trans_rev":50,"ot_allow":0,"first_dt":"2026-09-03","last_dt":"2026-09-15","status_full":"Partial $0 (2 of 3 trips $0): 2 of 3 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip."},{"truck":"Tb7","co":"WTC","site":"Sabeh Beton","supplier":"sabeh beton","product":"Radm","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":56,"zero_qty":0,"mat_cost":-180,"trans_units":[75],"haul_rev":150,"per_trip":75,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-22","max_date":"2026-09-24","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $75/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Sabeh Beton","vol":56,"trans_rev":150,"ot_allow":0,"first_dt":"2026-09-22","last_dt":"2026-09-24","status_full":"Strong Rate ($80/trip): Flat rate $75/truck via WTC Hauler Rate Schedule."},{"truck":"Tb7","co":"WTC","site":"Radm Spinneys","supplier":"Haj Ali Bdeir","product":"Ramel Mrml","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":56,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":100,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-08","max_date":"2026-09-08","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Radm Spinneys (Haj Ali Bdeir)","vol":56,"trans_rev":100,"ot_allow":0,"first_dt":"2026-09-08","last_dt":"2026-09-08","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"Tb7","co":"WTC","site":"Mega Beton","supplier":"mega beton","product":"Radm","region":"Excluded","trips":2,"paid_trips":2,"zero_trips":0,"qty":56,"zero_qty":0,"mat_cost":-160,"trans_units":[50],"haul_rev":100,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-22","max_date":"2026-09-24","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Mega Beton","vol":56,"trans_rev":100,"ot_allow":0,"first_dt":"2026-09-22","last_dt":"2026-09-24","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"Tb7","co":"WTC","site":"Radwan Sidani","supplier":"Radwan Sidani","product":"Ramel Mrml","region":"Mar Elias","trips":2,"paid_trips":2,"zero_trips":0,"qty":58,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":100,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-10-05","max_date":"2026-10-05","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Radwan Sidani","vol":58,"trans_rev":100,"ot_allow":0,"first_dt":"2026-10-05","last_dt":"2026-10-05","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"Tb7","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"SAND","region":"Excluded","trips":2,"paid_trips":0,"zero_trips":2,"qty":56,"zero_qty":56,"mat_cost":840,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-09-18","max_date":"2026-09-18","status":"Missing Product Rule ($0 Haulage)","est_missing":100,"note":"WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'SAND' got $0. Missing $100.00.","zero_dates":["2026-09-18"],"site_label":"Ali Klait","vol":56,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-18","last_dt":"2026-09-18","status_full":"Missing Product Rule ($0 Haulage): WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'SAND' got $0. Missing $100.00."},{"truck":"Tb7","co":"WTC","site":"Radm","supplier":"Haj Ali Bdeir","product":"Ramel Mrml","region":"Excluded","trips":1,"paid_trips":1,"zero_trips":0,"qty":28,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":50,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Mohamad Habib","min_date":"2026-08-28","max_date":"2026-08-28","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Radm (Haj Ali Bdeir)","vol":28,"trans_rev":50,"ot_allow":0,"first_dt":"2026-08-28","last_dt":"2026-08-28","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"Tb9","co":"WTC","site":"Al Jawad","supplier":"Hussein Hamdan","product":"Ramel Mrml","region":"Excluded","trips":73,"paid_trips":73,"zero_trips":0,"qty":1971,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":3650,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-07","max_date":"2026-10-22","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Al Jawad (Hussein Hamdan)","vol":1971,"trans_rev":3650,"ot_allow":0,"first_dt":"2026-09-07","last_dt":"2026-10-22","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"Tb9","co":"WTC","site":"Spinneys Mar Elias","supplier":"Ebco Bitar","product":"Ramel Mrml","region":"spinneys Mar Elias","trips":70,"paid_trips":63,"zero_trips":7,"qty":1890,"zero_qty":189,"mat_cost":0,"trans_units":[0,50],"haul_rev":3150,"per_trip":45,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-31","max_date":"2026-10-15","status":"Partial $0 (7 of 70 trips $0)","est_missing":350,"note":"7 of 70 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","zero_dates":["2026-08-31"],"site_label":"Spinneys Mar Elias (Ebco Bitar)","vol":1890,"trans_rev":3150,"ot_allow":0,"first_dt":"2026-08-31","last_dt":"2026-10-15","status_full":"Partial $0 (7 of 70 trips $0): 7 of 70 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip."},{"truck":"Tb9","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"Ramel Mrml","region":"Excluded","trips":39,"paid_trips":37,"zero_trips":2,"qty":1053,"zero_qty":54,"mat_cost":6318,"trans_units":[0,50],"haul_rev":1850,"per_trip":47.44,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-03","max_date":"2026-10-02","status":"Partial $0 (2 of 39 trips $0)","est_missing":100,"note":"2 of 39 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","zero_dates":["2026-09-03"],"site_label":"Ali Klait","vol":1053,"trans_rev":1850,"ot_allow":0,"first_dt":"2026-09-03","last_dt":"2026-10-02","status_full":"Partial $0 (2 of 39 trips $0): 2 of 39 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip."},{"truck":"Tb9","co":"BBConstruction","site":"WTC","supplier":"wtc","product":"Dabsh","region":"Excluded","trips":7,"paid_trips":0,"zero_trips":7,"qty":189,"zero_qty":189,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-24","max_date":"2026-09-11","status":"Inter-Plant Haul ($0 Haulage)","est_missing":453.6,"note":"Hauling Dabsh from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (7 trips = $0; $453.60 at $2.40/m³).","zero_dates":["2026-08-24","2026-08-28","2026-08-29","2026-08-31","2026-09-11"],"site_label":"WTC","vol":189,"trans_rev":0,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-09-11","status_full":"Inter-Plant Haul ($0 Haulage): Hauling Dabsh from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (7 trips = $0; $453.60 at $2.40/m³)."},{"truck":"Tb9","co":"WTC","site":"Mega Beton","supplier":"mega beton","product":"Radm","region":"Excluded","trips":5,"paid_trips":5,"zero_trips":0,"qty":135,"zero_qty":0,"mat_cost":-400,"trans_units":[50],"haul_rev":250,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-10","max_date":"2026-09-22","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Mega Beton","vol":135,"trans_rev":250,"ot_allow":0,"first_dt":"2026-09-10","last_dt":"2026-09-22","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"Tb9","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"SAND","region":"Excluded","trips":4,"paid_trips":0,"zero_trips":4,"qty":108,"zero_qty":108,"mat_cost":1620,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-14","max_date":"2026-09-18","status":"Missing Product Rule ($0 Haulage)","est_missing":200,"note":"WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 4 loads of 'SAND' got $0. Missing $200.00.","zero_dates":["2026-09-14","2026-09-18"],"site_label":"Ali Klait","vol":108,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-18","status_full":"Missing Product Rule ($0 Haulage): WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 4 loads of 'SAND' got $0. Missing $200.00."},{"truck":"Tb9","co":"WTC","site":"Ibrahim Bdeir Aawkar","supplier":"Haj Ibrahim","product":"Ramel Mrml","region":"Excluded","trips":3,"paid_trips":3,"zero_trips":0,"qty":81,"zero_qty":0,"mat_cost":150,"trans_units":[120],"haul_rev":360,"per_trip":120,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-26","max_date":"2026-08-28","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $120/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Ibrahim Bdeir Aawkar (Haj Ibrahim)","vol":81,"trans_rev":360,"ot_allow":0,"first_dt":"2026-08-26","last_dt":"2026-08-28","status_full":"Strong Rate ($80/trip): Flat rate $120/truck via WTC Hauler Rate Schedule."},{"truck":"Tb9","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Dabsh","region":"Excluded","trips":3,"paid_trips":0,"zero_trips":3,"qty":81,"zero_qty":81,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-24","max_date":"2026-10-22","status":"No BBC Rule ($0 Haulage)","est_missing":150,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (3 trips of Dabsh = $0; benchmark $150.00 at $50/trip).","zero_dates":["2026-09-24","2026-10-07","2026-10-22"],"site_label":"Al Jawad (Aljawad)","vol":81,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-24","last_dt":"2026-10-22","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (3 trips of Dabsh = $0; benchmark $150.00 at $50/trip)."},{"truck":"Tb9","co":"BBConstruction","site":"WTC","supplier":"wtc","product":"Raml Bab Thani","region":"Excluded","trips":3,"paid_trips":0,"zero_trips":3,"qty":81,"zero_qty":81,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-13","max_date":"2026-10-14","status":"Inter-Plant Haul ($0 Haulage)","est_missing":194.4,"note":"Hauling Raml Bab Thani from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (3 trips = $0; $194.40 at $2.40/m³).","zero_dates":["2026-10-13","2026-10-14"],"site_label":"WTC","vol":81,"trans_rev":0,"ot_allow":0,"first_dt":"2026-10-13","last_dt":"2026-10-14","status_full":"Inter-Plant Haul ($0 Haulage): Hauling Raml Bab Thani from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (3 trips = $0; $194.40 at $2.40/m³)."},{"truck":"Tb9","co":"WTC","site":"Radwan Sidani","supplier":"Radwan Sidani","product":"Ramel Mrml","region":"Mar Elias","trips":2,"paid_trips":1,"zero_trips":1,"qty":54,"zero_qty":27,"mat_cost":0,"trans_units":[0,50],"haul_rev":50,"per_trip":25,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-08-24","max_date":"2026-10-22","status":"Partial $0 (1 of 2 trips $0)","est_missing":50,"note":"1 of 2 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","zero_dates":["2026-08-24"],"site_label":"Radwan Sidani","vol":54,"trans_rev":50,"ot_allow":0,"first_dt":"2026-08-24","last_dt":"2026-10-22","status_full":"Partial $0 (1 of 2 trips $0): 1 of 2 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip."},{"truck":"Tb9","co":"WTC","site":"Ali Klait","supplier":"Ali Klait","product":"Soil","region":"Excluded","trips":2,"paid_trips":0,"zero_trips":2,"qty":54,"zero_qty":54,"mat_cost":378,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-14","max_date":"2026-09-14","status":"Missing Product Rule ($0 Haulage)","est_missing":100,"note":"WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'Soil' got $0. Missing $100.00.","zero_dates":["2026-09-14"],"site_label":"Ali Klait","vol":54,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-14","status_full":"Missing Product Rule ($0 Haulage): WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'Soil' got $0. Missing $100.00."},{"truck":"Tb9","co":"WTC","site":"Sibline","supplier":"Sibline","product":"Radm","region":"Sibline","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"zero_qty":0,"mat_cost":0,"trans_units":[80],"haul_rev":80,"per_trip":80,"ot_trips":1,"ot_amt":10,"drivers":"Ali Saleh","min_date":"2026-10-01","max_date":"2026-10-01","status":"Strong Rate ($80/trip)","est_missing":0,"note":"Flat rate $80/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Sibline","vol":27,"trans_rev":80,"ot_allow":10,"first_dt":"2026-10-01","last_dt":"2026-10-01","status_full":"Strong Rate ($80/trip): Flat rate $80/truck via WTC Hauler Rate Schedule."},{"truck":"Tb9","co":"WTC","site":"Radm Spinneys","supplier":"Haj Ali Bdeir","product":"Ramel Mrml","region":"Excluded","trips":1,"paid_trips":1,"zero_trips":0,"qty":27,"zero_qty":0,"mat_cost":0,"trans_units":[50],"haul_rev":50,"per_trip":50,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-10","max_date":"2026-09-10","status":"Standard Flat ($50/trip)","est_missing":0,"note":"Flat rate $50/truck via WTC Hauler Rate Schedule.","zero_dates":[],"site_label":"Radm Spinneys (Haj Ali Bdeir)","vol":27,"trans_rev":50,"ot_allow":0,"first_dt":"2026-09-10","last_dt":"2026-09-10","status_full":"Standard Flat ($50/trip): Flat rate $50/truck via WTC Hauler Rate Schedule."},{"truck":"Tb9","co":"WTC","site":"Amhaz Mathaf","supplier":"Hassan Amhaz","product":"Ramel Mrml","region":"Excluded","trips":1,"paid_trips":0,"zero_trips":1,"qty":27,"zero_qty":27,"mat_cost":75,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-10-23","max_date":"2026-10-23","status":"Owner=WTC Lag / Missing Rule ($0 Haulage)","est_missing":50,"note":"Amhaz Mathaf (Oct 23, Inv #19973) has no rate rule in WTC Hauler Rate Schedule ($0 instead of $50/trip).","zero_dates":["2026-10-23"],"site_label":"Amhaz Mathaf (Hassan Amhaz)","vol":27,"trans_rev":0,"ot_allow":0,"first_dt":"2026-10-23","last_dt":"2026-10-23","status_full":"Owner=WTC Lag / Missing Rule ($0 Haulage): Amhaz Mathaf (Oct 23, Inv #19973) has no rate rule in WTC Hauler Rate Schedule ($0 instead of $50/trip)."},{"truck":"Tb9","co":"BBConstruction","site":"Al Jawad","supplier":"Aljawad","product":"Ramel Mrml","region":"Excluded","trips":1,"paid_trips":0,"zero_trips":1,"qty":27,"zero_qty":27,"mat_cost":0,"trans_units":[0],"haul_rev":0,"per_trip":0,"ot_trips":0,"ot_amt":0,"drivers":"Ali Saleh","min_date":"2026-09-14","max_date":"2026-09-14","status":"No BBC Rule ($0 Haulage)","est_missing":50,"note":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (1 trips of Ramel Mrml = $0; benchmark $50.00 at $50/trip).","zero_dates":["2026-09-14"],"site_label":"Al Jawad (Aljawad)","vol":27,"trans_rev":0,"ot_allow":0,"first_dt":"2026-09-14","last_dt":"2026-09-14","status_full":"No BBC Rule ($0 Haulage): Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (1 trips of Ramel Mrml = $0; benchmark $50.00 at $50/trip)."}],"zero_haulage_groups":[{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"TB1","counterparty":"Ebco Bitar","site":"Spinneys Mar Elias","product":"Ramel Mrml","zero_trips":5,"total_route_trips":32,"ot_trips":0,"zero_vol":145,"dates":"2026-08-31 to 2026-08-31","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":250,"reason":"5 of 32 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","invoices":"6829, 6830, 6844, 6845, 6846","all_invoices":"6829, 6830, 6844, 6845, 6846"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"TB1","counterparty":"Sibline","site":"Sibline","product":"Ramel Mrml","zero_trips":5,"total_route_trips":5,"ot_trips":5,"zero_vol":145,"dates":"2026-10-12 to 2026-10-12","fair_rate_basis":"$80.00/truck (WTC Hauler Rate Schedule Sibline Rate)","est_missing":400,"reason":"WTC Hauler Rate Schedule $80/truck rule for Sibline only covers Product='Radm', so 5 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $400.00.","invoices":"19476, 19483, 19486, 19490, 19500","all_invoices":"19476, 19483, 19486, 19490, 19500"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"TB1","counterparty":"Radwan Sidani","site":"Radwan Sidani","product":"Ramel Mrml","zero_trips":1,"total_route_trips":7,"ot_trips":0,"zero_vol":29,"dates":"2026-08-24 to 2026-08-24","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":50,"reason":"1 of 7 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","invoices":"15806","all_invoices":"15806"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"TB1","counterparty":"Ali Klait","site":"Ali Klait","product":"SAND","zero_trips":1,"total_route_trips":1,"ot_trips":0,"zero_vol":29,"dates":"2026-09-14 to 2026-09-14","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":50,"reason":"WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 1 loads of 'SAND' got $0. Missing $50.00.","invoices":"17279","all_invoices":"17279"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb7","counterparty":"Sibline","site":"Sibline","product":"Ramel Mrml","zero_trips":11,"total_route_trips":11,"ot_trips":11,"zero_vol":319,"dates":"2026-10-12 to 2026-10-12","fair_rate_basis":"$80.00/truck (WTC Hauler Rate Schedule Sibline Rate)","est_missing":880,"reason":"WTC Hauler Rate Schedule $80/truck rule for Sibline only covers Product='Radm', so 11 OT loads of 'Ramel Mrml' on Oct 12 got $0. Missing $880.00.","invoices":"19477, 19481, 19482, 19484, 19485, 19492, 19494, 19495, 19497, 19498, 19499","all_invoices":"19477, 19481, 19482, 19484, 19485, 19492, 19494, 19495, 19497, 19498, 19499"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb7","counterparty":"Ali Klait","site":"Ali Klait","product":"Ramel Mrml","zero_trips":2,"total_route_trips":3,"ot_trips":0,"zero_vol":54,"dates":"2026-09-03 to 2026-09-03","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":100,"reason":"2 of 3 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","invoices":"17031, 17033","all_invoices":"17031, 17033"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb7","counterparty":"Ali Klait","site":"Ali Klait","product":"SAND","zero_trips":2,"total_route_trips":2,"ot_trips":0,"zero_vol":56,"dates":"2026-09-18 to 2026-09-18","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":100,"reason":"WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'SAND' got $0. Missing $100.00.","invoices":"17288, 17290","all_invoices":"17288, 17290"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Ebco Bitar","site":"Spinneys Mar Elias","product":"Ramel Mrml","zero_trips":7,"total_route_trips":70,"ot_trips":0,"zero_vol":189,"dates":"2026-08-31 to 2026-08-31","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":350,"reason":"7 of 70 trips (2026-08-31 to 2026-08-31) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","invoices":"6831, 6838, 6839, 6840, 6849, 6850, 23051","all_invoices":"6831, 6838, 6839, 6840, 6849, 6850, 23051"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Ali Klait","site":"Ali Klait","product":"SAND","zero_trips":4,"total_route_trips":4,"ot_trips":0,"zero_vol":108,"dates":"2026-09-14 to 2026-09-18","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":200,"reason":"WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 4 loads of 'SAND' got $0. Missing $200.00.","invoices":"17276, 17282, 17283, 17287","all_invoices":"17276, 17282, 17283, 17287"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Ali Klait","site":"Ali Klait","product":"Ramel Mrml","zero_trips":2,"total_route_trips":39,"ot_trips":0,"zero_vol":54,"dates":"2026-09-03 to 2026-09-03","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":100,"reason":"2 of 39 trips (2026-09-03 to 2026-09-03) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","invoices":"17030, 17032","all_invoices":"17030, 17032"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Ali Klait","site":"Ali Klait","product":"Soil","zero_trips":2,"total_route_trips":2,"ot_trips":0,"zero_vol":54,"dates":"2026-09-14 to 2026-09-14","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":100,"reason":"WTC Hauler Rate Schedule $50/truck rule for Ali Klait only covers 'Ramel Mrml', so 2 loads of 'Soil' got $0. Missing $100.00.","invoices":"17143, 17150","all_invoices":"17143, 17150"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Radwan Sidani","site":"Radwan Sidani","product":"Ramel Mrml","zero_trips":1,"total_route_trips":2,"ot_trips":0,"zero_vol":27,"dates":"2026-08-24 to 2026-08-24","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":50,"reason":"1 of 2 trips (2026-08-24 to 2026-08-24) had Owner='WTC' in Recorded Raw Material Register before Sep 4 Truck Ownership Log cutover date and got $0 instead of $50/trip.","invoices":"15805","all_invoices":"15805"},{"stream":"Raw Material (Haulage = $0)","co":"WTC","truck":"Tb9","counterparty":"Hassan Amhaz","site":"Amhaz Mathaf","product":"Ramel Mrml","zero_trips":1,"total_route_trips":1,"ot_trips":0,"zero_vol":27,"dates":"2026-10-23 to 2026-10-23","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":50,"reason":"Amhaz Mathaf (Oct 23, Inv #19973) has no rate rule in WTC Hauler Rate Schedule ($0 instead of $50/trip).","invoices":"19973","all_invoices":"19973"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Aljawad","site":"Al Jawad","product":"Dabsh","zero_trips":26,"total_route_trips":26,"ot_trips":0,"zero_vol":754,"dates":"2026-09-23 to 2026-10-20","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":1300,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (26 trips of Dabsh = $0; benchmark $1,300.00 at $50/trip).","invoices":"39076, 39078, 39079, 39080, 39081, 39082, 39083, 39085, 39087, 39089, 39091, 39094 (+14 more)","all_invoices":"39076, 39078, 39079, 39080, 39081, 39082, 39083, 39085, 39087, 39089, 39091, 39094, 39096, 39099, 36176, 36178, 36180, 36181, 36195, 36196, 36199, 36200, 36202, 36203, 36204, 36208"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"TB1","counterparty":"wtc","site":"WTC","product":"Dabsh","zero_trips":21,"total_route_trips":21,"ot_trips":0,"zero_vol":601,"dates":"2026-08-24 to 2026-10-20","fair_rate_basis":"$2.40/m³ (BBC Hauler Rate Schedule idx=8 Rate)","est_missing":1442.4,"reason":"Hauling Dabsh from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (21 trips = $0; $1,442.40 at $2.40/m³).","invoices":"39033, 39034, 39035, 39036, 39040, 39047, 39050, 39051, 39053, 39055, 39057, 39058 (+9 more)","all_invoices":"39033, 39034, 39035, 39036, 39040, 39047, 39050, 39051, 39053, 39055, 39057, 39058, 39061, 39064, 39068, 39071, 39075, 39086, 39092, 36206, 36211"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Wael el Haj","site":"Wael El Haj","product":"Trab Mrml","zero_trips":14,"total_route_trips":14,"ot_trips":0,"zero_vol":406,"dates":"2026-08-26 to 2026-09-03","fair_rate_basis":"$4.00/m³ (BBC Hauler Rate Schedule idx=22)","est_missing":1624,"reason":"BBC Hauler Rate Schedule idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in Truck Ownership Log, and omitted Hussein Bdeir. Missing $1,624.00.","invoices":"39712, 39716, 39718, 39720, 39721, 39724, 39727, 39730, 39735, 39739, 39743, 39745 (+2 more)","all_invoices":"39712, 39716, 39718, 39720, 39721, 39724, 39727, 39730, 39735, 39739, 39743, 39745, 39746, 39151"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"TB1","counterparty":"wtc","site":"WTC","product":"Raml Bab Thani","zero_trips":6,"total_route_trips":6,"ot_trips":0,"zero_vol":174,"dates":"2026-10-13 to 2026-10-19","fair_rate_basis":"$2.40/m³ (BBC Hauler Rate Schedule idx=8 Rate)","est_missing":417.6,"reason":"Hauling Raml Bab Thani from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (6 trips = $0; $417.60 at $2.40/m³).","invoices":"36183, 36189, 36190, 36191, 36194, 36207","all_invoices":"36183, 36189, 36190, 36191, 36194, 36207"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Aljawad","site":"Al Jawad","product":"Ramel Mrml","zero_trips":5,"total_route_trips":5,"ot_trips":0,"zero_vol":145,"dates":"2026-09-14 to 2026-09-24","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":250,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (5 trips of Ramel Mrml = $0; benchmark $250.00 at $50/trip).","invoices":"36152, 36157, 36158, 36160, 36161","all_invoices":"36152, 36157, 36158, 36160, 36161"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"wtc","site":"WTC","product":"Dabsh","zero_trips":13,"total_route_trips":13,"ot_trips":0,"zero_vol":365,"dates":"2026-08-26 to 2026-09-24","fair_rate_basis":"$2.40/m³ (BBC Hauler Rate Schedule idx=8 Rate)","est_missing":876,"reason":"Hauling Dabsh from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (13 trips = $0; $876.00 at $2.40/m³).","invoices":"39038, 39039, 39059, 39060, 39062, 39063, 39066, 39067, 39069, 39070, 39072, 39073 (+1 more)","all_invoices":"39038, 39039, 39059, 39060, 39062, 39063, 39066, 39067, 39069, 39070, 39072, 39073, 39074"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Wael el Haj","site":"Wael El Haj","product":"Trab Mrml","zero_trips":11,"total_route_trips":11,"ot_trips":0,"zero_vol":308,"dates":"2026-08-26 to 2026-09-02","fair_rate_basis":"$4.00/m³ (BBC Hauler Rate Schedule idx=22)","est_missing":1232,"reason":"BBC Hauler Rate Schedule idx=22 set $4/m³ for Karim Bdeir, but typed Product='Transportation' instead of 'Trab Mrml', kept Owner='wtc' in Truck Ownership Log, and omitted Hussein Bdeir. Missing $1,232.00.","invoices":"39713, 39715, 39726, 39728, 39729, 39731, 39732, 39733, 39736, 39740, 39741","all_invoices":"39713, 39715, 39726, 39728, 39729, 39731, 39732, 39733, 39736, 39740, 39741"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Aljawad","site":"Al Jawad","product":"Dabsh","zero_trips":11,"total_route_trips":11,"ot_trips":0,"zero_vol":319,"dates":"2026-09-30 to 2026-10-22","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":550,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (11 trips of Dabsh = $0; benchmark $550.00 at $50/trip).","invoices":"39084, 39088, 39093, 39095, 39097, 39100, 36177, 36179, 36198, 36205, 36214","all_invoices":"39084, 39088, 39093, 39095, 39097, 39100, 36177, 36179, 36198, 36205, 36214"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Aljawad","site":"Al Jawad","product":"Ramel Mrml","zero_trips":4,"total_route_trips":4,"ot_trips":0,"zero_vol":113,"dates":"2026-09-14 to 2026-09-24","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":200,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (4 trips of Ramel Mrml = $0; benchmark $200.00 at $50/trip).","invoices":"36153, 36156, 36159, 36162","all_invoices":"36153, 36156, 36159, 36162"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb9","counterparty":"wtc","site":"WTC","product":"Dabsh","zero_trips":7,"total_route_trips":7,"ot_trips":0,"zero_vol":189,"dates":"2026-08-24 to 2026-09-11","fair_rate_basis":"$2.40/m³ (BBC Hauler Rate Schedule idx=8 Rate)","est_missing":453.6,"reason":"Hauling Dabsh from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (7 trips = $0; $453.60 at $2.40/m³).","invoices":"39031, 39041, 39042, 39044, 39046, 39049, 39065","all_invoices":"39031, 39041, 39042, 39044, 39046, 39049, 39065"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb9","counterparty":"Aljawad","site":"Al Jawad","product":"Dabsh","zero_trips":3,"total_route_trips":3,"ot_trips":0,"zero_vol":81,"dates":"2026-09-24 to 2026-10-22","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":150,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (3 trips of Dabsh = $0; benchmark $150.00 at $50/trip).","invoices":"39077, 39098, 36213","all_invoices":"39077, 39098, 36213"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb9","counterparty":"wtc","site":"WTC","product":"Raml Bab Thani","zero_trips":3,"total_route_trips":3,"ot_trips":0,"zero_vol":81,"dates":"2026-10-13 to 2026-10-14","fair_rate_basis":"$2.40/m³ (BBC Hauler Rate Schedule idx=8 Rate)","est_missing":194.4,"reason":"Hauling Raml Bab Thani from WTC to BBConstruction: BBC Hauler Rate Schedule idx=8 ($2.40/m³) expired and Truck Ownership Log kept Owner='wtc' (3 trips = $0; $194.40 at $2.40/m³).","invoices":"36185, 36187, 36192","all_invoices":"36185, 36187, 36192"},{"stream":"Raw Material (Haulage = $0)","co":"BBConstruction","truck":"Tb9","counterparty":"Aljawad","site":"Al Jawad","product":"Ramel Mrml","zero_trips":1,"total_route_trips":1,"ot_trips":0,"zero_vol":27,"dates":"2026-09-14 to 2026-09-14","fair_rate_basis":"$50.00/truck (Standard Sand/Soil Haul Rate)","est_missing":50,"reason":"Al Jawad pays $50/truck on WTC, but BBConstruction Hauler Rate Schedule has no rule for Aljawad (1 trips of Ramel Mrml = $0; benchmark $50.00 at $50/trip).","invoices":"36155","all_invoices":"36155"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Sabeh Beton","site":"Choueifat","product":"Jarousha","zero_trips":33,"total_route_trips":33,"ot_trips":0,"zero_vol":957,"dates":"2026-08-26 to 2026-10-23","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":3828,"reason":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) Delivery Rate Schedule split on BBConstruction.","invoices":"1634, 1648, 1664, 1667, 1678, 1681, 1694, 1705, 1711, 1730, 1758, 1772 (+21 more)","all_invoices":"1634, 1648, 1664, 1667, 1678, 1681, 1694, 1705, 1711, 1730, 1758, 1772, 1794, 1807, 1817, 1831, 1846, 1871, 1877, 1903, 1909, 1914, 1919, 1933, 1950, 1960, 1988, 2010, 2037, 2048, 2059, 2069, 2085"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Sabeh Beton","site":"Choueifat","product":"sarek","zero_trips":6,"total_route_trips":6,"ot_trips":0,"zero_vol":228.18,"dates":"2026-09-23 to 2026-10-17","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":912.72,"reason":"Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$152/trip) Delivery Rate Schedule split on BBConstruction.","invoices":"11466, 11519, 11564, 11714, 11733, 11746","all_invoices":"11466, 11519, 11564, 11714, 11733, 11746"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"TB1","counterparty":"Sabeh Beton","site":"Nahr El-Mot","product":"Jarousha","zero_trips":1,"total_route_trips":1,"ot_trips":0,"zero_vol":29,"dates":"2026-09-15 to 2026-09-15","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":116,"reason":"Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$116/trip) Delivery Rate Schedule split on BBConstruction.","invoices":"1784","all_invoices":"1784"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Sabeh Beton","site":"Choueifat","product":"Jarousha","zero_trips":45,"total_route_trips":45,"ot_trips":0,"zero_vol":1285,"dates":"2026-08-26 to 2026-10-20","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":5140,"reason":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$114/trip) Delivery Rate Schedule split on BBConstruction.","invoices":"1639, 1655, 1659, 1665, 1671, 1684, 1693, 1707, 1714, 1723, 1751, 1756 (+33 more)","all_invoices":"1639, 1655, 1659, 1665, 1671, 1684, 1693, 1707, 1714, 1723, 1751, 1756, 1760, 1761, 1773, 1802, 1806, 1818, 1834, 1851, 1878, 1881, 1884, 1893, 1899, 1906, 1918, 1921, 1927, 1929, 1937, 1939, 1943, 1966, 1968, 1973, 1976, 1981, 1992, 2013, 2026, 2035, 2038, 2046, 2063"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Sabeh Beton","site":"Choueifat","product":"sarek","zero_trips":4,"total_route_trips":4,"ot_trips":0,"zero_vol":149.88,"dates":"2026-09-24 to 2026-10-17","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":599.52,"reason":"Delivered at $19.0-$19.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$150/trip) Delivery Rate Schedule split on BBConstruction.","invoices":"11484, 11602, 11737, 11752","all_invoices":"11484, 11602, 11737, 11752"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"Tb7","counterparty":"Sabeh Beton","site":"Nahr El-Mot","product":"Jarousha","zero_trips":2,"total_route_trips":2,"ot_trips":0,"zero_vol":56,"dates":"2026-09-14 to 2026-09-15","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":224,"reason":"Delivered at $23.0-$23.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$112/trip) Delivery Rate Schedule split on BBConstruction.","invoices":"1783, 1791","all_invoices":"1783, 1791"},{"stream":"Sales Delivery (Trans Price = $0)","co":"BBConstruction","truck":"Tb9","counterparty":"Sabeh Beton","site":"Choueifat","product":"Jarousha","zero_trips":5,"total_route_trips":5,"ot_trips":0,"zero_vol":135,"dates":"2026-08-28 to 2026-10-13","fair_rate_basis":"$4.00/m³ (Bundled Delivered Price $19-$23/m³)","est_missing":540,"reason":"Delivered at $19.5-$22.0/m³ all-in (vs ~$10.50/m³ ex-works); missing $4.00/m³ (~$108/trip) Delivery Rate Schedule split on BBConstruction.","invoices":"1662, 1666, 1759, 1972, 2019","all_invoices":"1662, 1666, 1759, 1972, 2019"}],"truck_expenses":[{"truck":"TB1","co":"WTC","date":"2026-08-03","after_cutover":false,"idx":3999,"invoice":"20","supplier":"KORRI AUTO S.A.L","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":471.75,"usd":471.75,"notes":"","inv":"20","sub":"Maintenance","unit_cost":471.75,"total":471.75,"is_post":false},{"truck":"TB1","co":"WTC","date":"2026-08-03","after_cutover":false,"idx":4000,"invoice":"9","supplier":"KORRI AUTO S.A.L","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":122.1,"usd":122.1,"notes":"","inv":"9","sub":"Maintenance","unit_cost":122.1,"total":122.1,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-08","after_cutover":false,"idx":4026,"invoice":"88","supplier":"Hshaysho","cat":"Repairs & Maintenance","subcat":"maintenance","is_fuel":false,"qty":1,"price":962,"usd":962,"notes":"","inv":"88","sub":"maintenance","unit_cost":962,"total":962,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-11","after_cutover":false,"idx":4035,"invoice":"7513","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":40,"usd":40,"notes":"","inv":"7513","sub":"Maintenance","unit_cost":40,"total":40,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-11","after_cutover":false,"idx":4039,"invoice":"7761","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":50,"usd":50,"notes":"","inv":"7761","sub":"Maintenance","unit_cost":50,"total":50,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-12","after_cutover":false,"idx":4047,"invoice":"1742","supplier":"ziadeh","cat":"Repairs & Maintenance","subcat":"maintenance","is_fuel":false,"qty":1,"price":115,"usd":115,"notes":"","inv":"1742","sub":"maintenance","unit_cost":115,"total":115,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-12","after_cutover":false,"idx":4048,"invoice":"1791","supplier":"ziadeh","cat":"Repairs & Maintenance","subcat":"maintenance","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"1791","sub":"maintenance","unit_cost":60,"total":60,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-12","after_cutover":false,"idx":4049,"invoice":"1758","supplier":"ziadeh","cat":"Repairs & Maintenance","subcat":"Battery","is_fuel":false,"qty":1,"price":470,"usd":470,"notes":"","inv":"1758","sub":"Battery","unit_cost":470,"total":470,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-12","after_cutover":false,"idx":4051,"invoice":"1784","supplier":"ziadeh","cat":"Repairs & Maintenance","subcat":"Wheel","is_fuel":false,"qty":1,"price":430,"usd":430,"notes":"","inv":"1784","sub":"Wheel","unit_cost":430,"total":430,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-14","after_cutover":false,"idx":4065,"invoice":"","supplier":"Harbi","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":1400,"usd":1400,"notes":"","inv":"","sub":"Maintenance","unit_cost":1400,"total":1400,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-15","after_cutover":false,"idx":4068,"invoice":"10533","supplier":"Mazen Abo Hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":30,"usd":30,"notes":"","inv":"10533","sub":"Maintenance","unit_cost":30,"total":30,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-15","after_cutover":false,"idx":4069,"invoice":"10534","supplier":"Mazen Abo Hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":194,"usd":194,"notes":"","inv":"10534","sub":"Maintenance","unit_cost":194,"total":194,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-15","after_cutover":false,"idx":4079,"invoice":"","supplier":"Hashesho","cat":"Repairs & Maintenance","subcat":"electrical","is_fuel":false,"qty":1,"price":315,"usd":315,"notes":"","inv":"","sub":"electrical","unit_cost":315,"total":315,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-19","after_cutover":false,"idx":4073,"invoice":"","supplier":"ADMOUN MARTINE","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":47,"usd":47,"notes":"","inv":"","sub":"Maintenance","unit_cost":47,"total":47,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-19","after_cutover":false,"idx":4096,"invoice":"20664","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":276,"price":1.24,"usd":342.24,"notes":"","inv":"20664","sub":"diesel","unit_cost":1.24,"total":342.24,"is_post":false},{"truck":"TB1","co":"WTC","date":"2026-08-20","after_cutover":false,"idx":4109,"invoice":"6847","supplier":"atwi","cat":"Parts","subcat":"tube","is_fuel":false,"qty":1,"price":40,"usd":40,"notes":"","inv":"6847","sub":"tube","unit_cost":40,"total":40,"is_post":false},{"truck":"Tb9","co":"WTC","date":"2026-08-22","after_cutover":false,"idx":4126,"invoice":"62","supplier":"Hshaysho","cat":"Repairs & Maintenance","subcat":"maintenance","is_fuel":false,"qty":1,"price":315,"usd":315,"notes":"","inv":"62","sub":"maintenance","unit_cost":315,"total":315,"is_post":false},{"truck":"Tb7","co":"WTC","date":"2026-08-29","after_cutover":true,"idx":4149,"invoice":"8752","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":40,"usd":40,"notes":"","inv":"8752","sub":"Maintenance","unit_cost":40,"total":40,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-08-29","after_cutover":true,"idx":4155,"invoice":"7916","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"WASH","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"7916","sub":"WASH","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-08-29","after_cutover":true,"idx":4156,"invoice":"7406","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":125,"usd":125,"notes":"","inv":"7406","sub":"Maintenance","unit_cost":125,"total":125,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-01","after_cutover":true,"idx":4162,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":74,"price":1.35,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.35,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-03","after_cutover":true,"idx":4183,"invoice":"15522","supplier":"Mazen Abo Hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":48,"usd":48,"notes":"","inv":"15522","sub":"Maintenance","unit_cost":48,"total":48,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-04","after_cutover":true,"idx":4184,"invoice":"435","supplier":"Star Solutions","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":394.05,"usd":394.05,"notes":"","inv":"435","sub":"Maintenance","unit_cost":394.05,"total":394.05,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-04","after_cutover":true,"idx":4185,"invoice":"443","supplier":"Star Solutions","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":233.1,"usd":233.1,"notes":"","inv":"443","sub":"Maintenance","unit_cost":233.1,"total":233.1,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-04","after_cutover":true,"idx":4186,"invoice":"449","supplier":"Star Solutions","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":389.61,"usd":389.61,"notes":"","inv":"449","sub":"Maintenance","unit_cost":389.61,"total":389.61,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-05","after_cutover":true,"idx":4198,"invoice":"","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.28,"usd":256,"notes":"","inv":"","sub":"diesel","unit_cost":1.28,"total":256,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-05","after_cutover":true,"idx":4199,"invoice":"","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.28,"usd":256,"notes":"","inv":"","sub":"diesel","unit_cost":1.28,"total":256,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-10","after_cutover":true,"idx":4219,"invoice":"","supplier":"mohamad habib","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":50,"usd":50,"notes":"","inv":"","sub":"Maintenance","unit_cost":50,"total":50,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-11","after_cutover":true,"idx":4221,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":77,"price":1.3,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.3,"total":100,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-11","after_cutover":true,"idx":4222,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":77,"price":1.3,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.3,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4220,"invoice":"","supplier":"najm","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":50,"usd":50,"notes":"","inv":"","sub":"Maintenance","unit_cost":50,"total":50,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4225,"invoice":"10213","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"10213","sub":"Maintenance","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4226,"invoice":"9288","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":80,"usd":80,"notes":"","inv":"9288","sub":"Maintenance","unit_cost":80,"total":80,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4227,"invoice":"9154","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":35,"usd":35,"notes":"","inv":"9154","sub":"Maintenance","unit_cost":35,"total":35,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4236,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":77,"price":1.3,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.3,"total":100,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-12","after_cutover":true,"idx":4238,"invoice":"20806","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":220,"price":1.3,"usd":286,"notes":"","inv":"20806","sub":"diesel","unit_cost":1.3,"total":286,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4246,"invoice":"20816","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.33,"usd":266,"notes":"","inv":"20816","sub":"diesel","unit_cost":1.33,"total":266,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4247,"invoice":"20817","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.33,"usd":266,"notes":"","inv":"20817","sub":"diesel","unit_cost":1.33,"total":266,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4248,"invoice":"20818","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":305,"price":1.33,"usd":405.65,"notes":"","inv":"20818","sub":"diesel","unit_cost":1.33,"total":405.65,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4249,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":77,"price":1.3,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.3,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4259,"invoice":"7026","supplier":"Ali Salman","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":30,"usd":30,"notes":"","inv":"7026","sub":"Maintenance","unit_cost":30,"total":30,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4260,"invoice":"7023","supplier":"Ali Salman","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":150,"usd":150,"notes":"","inv":"7023","sub":"Maintenance","unit_cost":150,"total":150,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-15","after_cutover":true,"idx":4262,"invoice":"7029","supplier":"Ali Salman","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":100,"usd":100,"notes":"","inv":"7029","sub":"Maintenance","unit_cost":100,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-17","after_cutover":true,"idx":4268,"invoice":"20836","supplier":"BBConstruction","cat":"Fuel","subcat":"Diesel","is_fuel":true,"qty":200,"price":1.38,"usd":276,"notes":"","inv":"20836","sub":"Diesel","unit_cost":1.38,"total":276,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-17","after_cutover":true,"idx":4272,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":73,"price":1.38,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.38,"total":100,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-18","after_cutover":true,"idx":4273,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":73,"price":1.38,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.38,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-18","after_cutover":true,"idx":4281,"invoice":"2174","supplier":"ziadeh","cat":"Repairs & Maintenance","subcat":"Wheel","is_fuel":false,"qty":1,"price":830,"usd":830,"notes":"","inv":"2174","sub":"Wheel","unit_cost":830,"total":830,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-19","after_cutover":true,"idx":4285,"invoice":"9056","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"WASH","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"9056","sub":"WASH","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-19","after_cutover":true,"idx":4286,"invoice":"9069","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"tube","is_fuel":false,"qty":1,"price":75,"usd":75,"notes":"","inv":"9069","sub":"tube","unit_cost":75,"total":75,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-19","after_cutover":true,"idx":4288,"invoice":"10597","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":144,"usd":144,"notes":"","inv":"10597","sub":"Maintenance","unit_cost":144,"total":144,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4311,"invoice":"20857","supplier":"BBConstruction","cat":"Fuel","subcat":"Diesel","is_fuel":true,"qty":100,"price":1.49,"usd":149,"notes":"","inv":"20857","sub":"Diesel","unit_cost":1.49,"total":149,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4313,"invoice":"20859","supplier":"BBConstruction","cat":"Fuel","subcat":"Diesel","is_fuel":true,"qty":100,"price":1.49,"usd":149,"notes":"","inv":"20859","sub":"Diesel","unit_cost":1.49,"total":149,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4317,"invoice":"","supplier":"Al kawthar","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"","sub":"Maintenance","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4319,"invoice":"7032","supplier":"ali salman","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":200,"usd":200,"notes":"","inv":"7032","sub":"Maintenance","unit_cost":200,"total":200,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4320,"invoice":"7035","supplier":"ali salman","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":125,"usd":125,"notes":"","inv":"7035","sub":"Maintenance","unit_cost":125,"total":125,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-09-25","after_cutover":true,"idx":4322,"invoice":"5903","supplier":"mazen abo hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":100,"usd":100,"notes":"","inv":"5903","sub":"Maintenance","unit_cost":100,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-28","after_cutover":true,"idx":4337,"invoice":"5907","supplier":"Mazen Abo Hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":250,"usd":250,"notes":"","inv":"5907","sub":"Maintenance","unit_cost":250,"total":250,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-09-28","after_cutover":true,"idx":4342,"invoice":"","supplier":"FUEL STATION","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":64,"price":1.5625,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.5625,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-01","after_cutover":true,"idx":4357,"invoice":"20866","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":240,"price":1.46,"usd":350.4,"notes":"","inv":"20866","sub":"diesel","unit_cost":1.46,"total":350.4,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-01","after_cutover":true,"idx":4358,"invoice":"20868","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.46,"usd":292,"notes":"","inv":"20868","sub":"diesel","unit_cost":1.46,"total":292,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-03","after_cutover":true,"idx":4371,"invoice":"","supplier":"najm","cat":"Parts","subcat":"Maintenance","is_fuel":false,"qty":2,"price":200,"usd":400,"notes":"","inv":"","sub":"Maintenance","unit_cost":200,"total":400,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-03","after_cutover":true,"idx":4372,"invoice":"","supplier":"Hashesho","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":400,"usd":400,"notes":"","inv":"","sub":"Maintenance","unit_cost":400,"total":400,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-03","after_cutover":true,"idx":4373,"invoice":"4","supplier":"ismail hadad","cat":"Repairs & Maintenance","subcat":"maintenance","is_fuel":false,"qty":1,"price":275,"usd":250,"notes":"","inv":"4","sub":"maintenance","unit_cost":275,"total":250,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-10-05","after_cutover":true,"idx":4379,"invoice":"11056","supplier":"Imad Ismael","cat":"Repairs & Maintenance","subcat":"WASH","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"11056","sub":"WASH","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-09","after_cutover":true,"idx":4425,"invoice":"","supplier":"bbconstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.42,"usd":284,"notes":"","inv":"","sub":"diesel","unit_cost":1.42,"total":284,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-09","after_cutover":true,"idx":4427,"invoice":"5921","supplier":"mazen abo hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":49,"usd":49,"notes":"","inv":"5921","sub":"Maintenance","unit_cost":49,"total":49,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-10-10","after_cutover":true,"idx":4435,"invoice":"22425","supplier":"NAJM","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":50,"usd":50,"notes":"","inv":"22425","sub":"Maintenance","unit_cost":50,"total":50,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-12","after_cutover":true,"idx":4440,"invoice":"","supplier":"ahmad ibrahim","cat":"Parts","subcat":"tube","is_fuel":false,"qty":1,"price":60,"usd":60,"notes":"","inv":"","sub":"tube","unit_cost":60,"total":60,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-13","after_cutover":true,"idx":4448,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":68,"price":1.48,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.48,"total":100,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-13","after_cutover":true,"idx":4454,"invoice":"","supplier":"bbconstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":150,"price":1.37,"usd":205.5,"notes":"","inv":"","sub":"diesel","unit_cost":1.37,"total":205.5,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-15","after_cutover":true,"idx":4462,"invoice":"20978","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.36,"usd":272,"notes":"","inv":"20978","sub":"diesel","unit_cost":1.36,"total":272,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-15","after_cutover":true,"idx":4465,"invoice":"20987","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":100,"price":1.36,"usd":136,"notes":"","inv":"20987","sub":"diesel","unit_cost":1.36,"total":136,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-17","after_cutover":true,"idx":2478,"invoice":"1717","supplier":"charif al kasem","cat":"Repairs & Maintenance","subcat":"march","is_fuel":false,"qty":1,"price":150,"usd":150,"notes":"","inv":"1717","sub":"march","unit_cost":150,"total":150,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-17","after_cutover":true,"idx":4478,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":73,"price":1.38,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.38,"total":100,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-20","after_cutover":true,"idx":4491,"invoice":"","supplier":"ALIG","cat":"Insurance - Auto/Property","subcat":"Insurance","is_fuel":false,"qty":1,"price":525,"usd":525,"notes":"","inv":"","sub":"Insurance","unit_cost":525,"total":525,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-20","after_cutover":true,"idx":4498,"invoice":"39156","supplier":"BBConstruction","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":200,"price":1.36,"usd":272,"notes":"","inv":"39156","sub":"diesel","unit_cost":1.36,"total":272,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-10-21","after_cutover":true,"idx":4515,"invoice":"42","supplier":"KORRI AUTO S.A.L","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":800.98,"usd":800.98,"notes":"","inv":"42","sub":"Maintenance","unit_cost":800.98,"total":800.98,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-21","after_cutover":true,"idx":4518,"invoice":"56","supplier":"KORRI AUTO S.A.L","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":321.9,"usd":321.9,"notes":"","inv":"56","sub":"Maintenance","unit_cost":321.9,"total":321.9,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-10-22","after_cutover":true,"idx":4525,"invoice":"12182","supplier":"imad ismael","cat":"Repairs & Maintenance","subcat":"تركيب جواني (Inner Seal Install)","is_fuel":false,"qty":1,"price":70,"usd":70,"notes":"","inv":"12182","sub":"تركيب جواني (Inner Seal Install)","unit_cost":70,"total":70,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-22","after_cutover":true,"idx":4527,"invoice":"12614","supplier":"imad ismael","cat":"Repairs & Maintenance","subcat":"wheel","is_fuel":false,"qty":1,"price":50,"usd":50,"notes":"","inv":"12614","sub":"wheel","unit_cost":50,"total":50,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-22","after_cutover":true,"idx":4528,"invoice":"12664","supplier":"imad ismael","cat":"Repairs & Maintenance","subcat":"تركيب جواني (Inner Seal Install)","is_fuel":false,"qty":1,"price":80,"usd":80,"notes":"","inv":"12664","sub":"تركيب جواني (Inner Seal Install)","unit_cost":80,"total":80,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-23","after_cutover":true,"idx":4534,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":35,"price":1.43,"usd":50,"notes":"","inv":"","sub":"diesel","unit_cost":1.43,"total":50,"is_post":true},{"truck":"Tb7","co":"WTC","date":"2026-10-23","after_cutover":true,"idx":4536,"invoice":"15543","supplier":"Mazen Abo Hamza","cat":"Repairs & Maintenance","subcat":"Maintenance","is_fuel":false,"qty":1,"price":160,"usd":160,"notes":"","inv":"15543","sub":"Maintenance","unit_cost":160,"total":160,"is_post":true},{"truck":"Tb9","co":"WTC","date":"2026-10-23","after_cutover":true,"idx":4537,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":70,"price":1.43,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.43,"total":100,"is_post":true},{"truck":"TB1","co":"WTC","date":"2026-10-23","after_cutover":true,"idx":4538,"invoice":"","supplier":"fuel station","cat":"Fuel","subcat":"diesel","is_fuel":true,"qty":70,"price":1.43,"usd":100,"notes":"","inv":"","sub":"diesel","unit_cost":1.43,"total":100,"is_post":true}],"ot_list":[{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7570,"invoice":"6372","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"6372","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7572,"invoice":"6374","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"6374","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7574,"invoice":"18976","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"18976","vol":29,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7576,"invoice":"18978","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18978","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7571,"invoice":"6373","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"6373","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7573,"invoice":"6375","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"6375","vol":28,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-08-31","idx":7575,"invoice":"18977","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"18977","vol":28,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-01","idx":7583,"invoice":"18996","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18996","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-01","idx":7585,"invoice":"18998","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18998","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-01","idx":7582,"invoice":"18995","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18995","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-02","idx":7588,"invoice":"18702","driver":"Ali Saleh","counterparty":"SOIME choueifat","site":"SOIME choueifat / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":52.785,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18702","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-03","idx":7592,"invoice":"18716","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18716","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-03","idx":7593,"invoice":"18717","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18717","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-03","idx":7598,"invoice":"18676","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18676","vol":28,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-03","idx":7595,"invoice":"18719","driver":"Ali Saleh","counterparty":"soime dawra","site":"soime dawra / dawra","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":80.5875,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18719","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-03","idx":7599,"invoice":"18678","driver":"Ali Saleh","counterparty":"soime dawra","site":"soime dawra / dawra","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":80.15875,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18678","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7604,"invoice":"18686","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18686","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7606,"invoice":"18688","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18688","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7601,"invoice":"18683","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18683","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7602,"invoice":"18684","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18684","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7607,"invoice":"18728","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18728","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-04","idx":7609,"invoice":"18733","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18733","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-05","idx":7611,"invoice":"18745","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18745","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-05","idx":7615,"invoice":"18749","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18749","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-08","idx":7618,"invoice":"15506","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15506","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7630,"invoice":"18955","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18955","vol":29,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7621,"invoice":"15511","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"15511","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7622,"invoice":"15512","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"15512","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7623,"invoice":"15513","driver":"Ali Saleh","counterparty":"safara","site":"safara / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":54,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"15513","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7628,"invoice":"18952","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18952","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-09","idx":7632,"invoice":"18957","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18957","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7636,"invoice":"18902","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18902","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7641,"invoice":"18908","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18908","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7642,"invoice":"18910","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18910","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7639,"invoice":"18906","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18906","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7643,"invoice":"18911","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18911","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7646,"invoice":"18914","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18914","vol":28,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7649,"invoice":"18917","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18917","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-10","idx":7638,"invoice":"18905","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18905","vol":27,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-11","idx":7669,"invoice":"18946","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18946","vol":28,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-11","idx":7663,"invoice":"18939","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Ramel","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18939","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-12","idx":7672,"invoice":"18864","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18864","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-12","idx":7674,"invoice":"18866","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18866","vol":29,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-12","idx":7677,"invoice":"18869","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18869","vol":29,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-12","idx":7675,"invoice":"18867","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18867","vol":28,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-13","idx":7680,"invoice":"18872","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18872","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-13","idx":7679,"invoice":"18871","driver":"Mohamad Habib","counterparty":"majbal rayan","site":"majbal rayan / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":56,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18871","vol":28,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-14","idx":7698,"invoice":"18763","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18763","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-14","idx":7702,"invoice":"18769","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18769","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-14","idx":7687,"invoice":"18755","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18755","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-14","idx":7683,"invoice":"18751","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18751","vol":27,"ot_allow":5},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-14","idx":7685,"invoice":"18753","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18753","vol":27,"ot_allow":5},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-15","idx":7711,"invoice":"18885","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18885","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7714,"invoice":"18889","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18889","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7722,"invoice":"18900","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18900","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7725,"invoice":"18779","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18779","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7721,"invoice":"18899","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18899","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7724,"invoice":"18778","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18778","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-16","idx":7726,"invoice":"18780","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18780","vol":27,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7736,"invoice":"18827","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18827","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7739,"invoice":"18831","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18831","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7737,"invoice":"18829","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18829","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7740,"invoice":"18832","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18832","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7732,"invoice":"18797","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18797","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-17","idx":7734,"invoice":"18800","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18800","vol":27,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-20","idx":7756,"invoice":"18815","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18815","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-20","idx":7754,"invoice":"18813","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18813","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-20","idx":7755,"invoice":"18814","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"18814","vol":27,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-21","idx":7761,"invoice":"15387","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15387","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-21","idx":7758,"invoice":"18817","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"18817","vol":28,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-22","idx":7770,"invoice":"15162","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15162","vol":29,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-22","idx":7772,"invoice":"15164","driver":"Majed Karam","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15164","vol":29,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-22","idx":7769,"invoice":"15160","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Kasara","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15160","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-22","idx":7771,"invoice":"15163","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15163","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-23","idx":7776,"invoice":"15126","driver":"Ali Saleh","counterparty":"majbal rayan","site":"majbal rayan / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":54,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"15126","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-23","idx":7778,"invoice":"15129","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15129","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-09-23","idx":7779,"invoice":"15130","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15130","vol":27,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-26","idx":7795,"invoice":"15416","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"15416","vol":28,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-26","idx":7801,"invoice":"15079","driver":"Mohamad Habib","counterparty":"haj ibrahim","site":"haj ibrahim / afak","region":"Unspecified","product":"Mghasal","qty":28,"trans_rev":56,"ot_rate_sp":0,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"15079","vol":28,"ot_allow":0},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-26","idx":7802,"invoice":"15080","driver":"Mohamad Habib","counterparty":"haj ibrahim","site":"haj ibrahim / afak","region":"Unspecified","product":"Mghasal","qty":28,"trans_rev":56,"ot_rate_sp":0,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"15080","vol":28,"ot_allow":0},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-27","idx":7803,"invoice":"15081","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"15081","vol":28,"ot_allow":10},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-28","idx":7819,"invoice":"19035","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19035","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-28","idx":7817,"invoice":"19033","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":28,"trans_rev":70,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19033","vol":28,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-09-29","idx":7828,"invoice":"15184","driver":"Majed Karam","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15184","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-09-29","idx":7822,"invoice":"19038","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":28,"trans_rev":98,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"19038","vol":28,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19556,"invoice":"6402","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6402","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19558,"invoice":"6404","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6404","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19559,"invoice":"6405","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6405","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19561,"invoice":"6407","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6407","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19562,"invoice":"6408","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6408","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19573,"invoice":"6419","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6419","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19576,"invoice":"6422","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6422","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19578,"invoice":"6424","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6424","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19565,"invoice":"6411","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6411","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19567,"invoice":"6413","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6413","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19568,"invoice":"6414","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6414","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19570,"invoice":"6416","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6416","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19572,"invoice":"6418","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6418","vol":28,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19579,"invoice":"6425","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":28,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6425","vol":28,"ot_allow":10},{"truck":"Tb9","type":"Raw Material","co":"WTC","date":"2026-10-01","idx":19563,"invoice":"6409","driver":"Ali Saleh","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":27,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"6409","vol":27,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-02","idx":19580,"invoice":"15276","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15276","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-02","idx":19582,"invoice":"15278","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15278","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-02","idx":19585,"invoice":"15281","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15281","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-02","idx":19586,"invoice":"15282","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15282","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-02","idx":7855,"invoice":"15273","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15273","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-02","idx":7856,"invoice":"15275","driver":"Mohamad Habib","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":72.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15275","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-05","idx":7870,"invoice":"15310","driver":"Mohamad Habib","counterparty":"majed terro","site":"majed terro / sibline","region":"Sibline","product":"Mghasal","qty":29,"trans_rev":101.5,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"15310","vol":29,"ot_allow":10},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-07","idx":7891,"invoice":"19458","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19458","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-07","idx":7892,"invoice":"19459","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19459","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-08","idx":7899,"invoice":"19518","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19518","vol":27,"ot_allow":7},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19720,"invoice":"15287","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15287","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19722,"invoice":"15289","driver":"Majed Karam","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15289","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19726,"invoice":"15293","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15293","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19727,"invoice":"15294","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15294","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19728,"invoice":"15295","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15295","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19716,"invoice":"15283","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15283","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19717,"invoice":"15284","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15284","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19718,"invoice":"15285","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15285","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19719,"invoice":"15286","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15286","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19725,"invoice":"15292","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15292","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19730,"invoice":"15297","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15297","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19731,"invoice":"15298","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15298","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-09","idx":19733,"invoice":"15300","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"15300","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19757,"invoice":"19476","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19476","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19771,"invoice":"19483","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19483","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19774,"invoice":"19486","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19486","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19787,"invoice":"19490","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19490","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19797,"invoice":"19500","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19500","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19758,"invoice":"19477","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19477","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19769,"invoice":"19481","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19481","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19770,"invoice":"19482","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19482","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19772,"invoice":"19484","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19484","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19773,"invoice":"19485","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19485","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19789,"invoice":"19492","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19492","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19791,"invoice":"19494","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19494","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19792,"invoice":"19495","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19495","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19794,"invoice":"19497","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19497","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19795,"invoice":"19498","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19498","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-12","idx":19796,"invoice":"19499","driver":"Mohamad Habib","counterparty":"Sibline","site":"SIBLINE","region":"Sibline","product":"Ramel Mrml","qty":29,"trans_rev":0,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19499","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-12","idx":7935,"invoice":"11705","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / choueifat","region":"Beirut","product":"Kasara","qty":29,"trans_rev":58,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"11705","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-12","idx":7937,"invoice":"11707","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / choueifat","region":"Beirut","product":"Kasara","qty":29,"trans_rev":58,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"11707","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-14","idx":7948,"invoice":"11713","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":58,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"11713","vol":29,"ot_allow":7},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-14","idx":7949,"invoice":"11714","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / choueifat","region":"Beirut","product":"Kasara","qty":29,"trans_rev":58,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"11714","vol":29,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-16","idx":7965,"invoice":"19367","driver":"Ali Saleh","counterparty":"soime choueifat","site":"soime choueifat / choueifat","region":"Beirut","product":"Mghasal","qty":27,"trans_rev":55.05625,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"19367","vol":27,"ot_allow":7},{"truck":"TB1","type":"Sales Delivery","co":"WTC","date":"2026-10-17","idx":7977,"invoice":"11728","driver":"Ahmad Hamoud","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / Gisr al bacha","region":"Excluded","product":"Mghasal","qty":29,"trans_rev":58,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"11728","vol":29,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-17","idx":7976,"invoice":"11727","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / Gisr al bacha","region":"Excluded","product":"Mghasal","qty":29,"trans_rev":58,"ot_rate_sp":5,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"11727","vol":29,"ot_allow":5},{"truck":"Tb7","type":"Sales Delivery","co":"WTC","date":"2026-10-17","idx":7979,"invoice":"11730","driver":"Mohamad Habib","counterparty":"sabeh beton s.r.l","site":"sabeh beton s.r.l / choueifat","region":"Beirut","product":"Mghasal","qty":29,"trans_rev":58,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"AM","stream":"Sales Delivery","inv":"11730","vol":29,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-21","idx":8010,"invoice":"19807","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Kasara","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"PM","stream":"Sales Delivery","inv":"19807","vol":27,"ot_allow":7},{"truck":"Tb9","type":"Sales Delivery","co":"WTC","date":"2026-10-22","idx":8017,"invoice":"19906","driver":"Ali Saleh","counterparty":"mega beton","site":"mega beton / choueifat","region":"Beirut","product":"Kasara","qty":27,"trans_rev":67.5,"ot_rate_sp":7,"ot_rate_pbi":0,"clock":"Excluded","stream":"Sales Delivery","inv":"19906","vol":27,"ot_allow":7},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19928,"invoice":"19252","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19252","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19929,"invoice":"19253","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19253","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19930,"invoice":"19254","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19254","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19934,"invoice":"19258","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19258","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19947,"invoice":"19272","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19272","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19951,"invoice":"19101","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19101","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19958,"invoice":"19108","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19108","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19964,"invoice":"19114","driver":"Ahmad Hamoud","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19114","vol":29,"ot_allow":10},{"truck":"TB1","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19975,"invoice":"19125","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19125","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19927,"invoice":"19251","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19251","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19936,"invoice":"19260","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19260","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19938,"invoice":"19262","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19262","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19939,"invoice":"19263","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19263","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19940,"invoice":"19264","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19264","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19941,"invoice":"19265","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19265","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19942,"invoice":"19266","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19266","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19959,"invoice":"19109","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19109","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19962,"invoice":"19112","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19112","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19963,"invoice":"19113","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19113","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19966,"invoice":"19116","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19116","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19968,"invoice":"19118","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19118","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19969,"invoice":"19119","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19119","vol":29,"ot_allow":10},{"truck":"Tb7","type":"Raw Material","co":"WTC","date":"2026-10-23","idx":19973,"invoice":"19123","driver":"Mohamad Habib","counterparty":"Sibline","site":"Sibline","region":"Sibline","product":"Radm","qty":29,"trans_rev":80,"ot_rate_sp":10,"ot_rate_pbi":0,"clock":"Excluded","stream":"Raw Material","inv":"19123","vol":29,"ot_allow":10}]};
  const BDEIR_CODES = ['TB1', 'Tb7', 'Tb9'];
  const WTC_OWN_CODES = ['TB8', 'Tb4', 'TB3', 'Tb2'];
  const CORE7_CODES = ['Tb7', 'Tb9', 'TB8', 'TB1', 'Tb4', 'TB3', 'Tb2'];

  const state = {
    scope: 'cutover',              // 'cutover' | 'live'
    mode: 'recorded',              // 'recorded' | 'strict' | 'full'
    tab: 'pnl',                    // 'pnl' | 'zero' | 'routes' | 'expenses' | 'overtime' | 'recon'
    cohort: 'bdeir',               // 'bdeir' | 'wtc_own' | 'core7' | 'family' | 'all' | 'custom'
    selectedTrucks: ['TB1', 'Tb7', 'Tb9'],
    coFilter: 'ALL',               // 'ALL' | 'WTC' | 'BBConstruction' | 'Lions Transport'
    pickerOpen: false,
    pickerSearch: '',
    zeroSearch: '',
    zeroStream: 'ALL',
    routeSearch: '',
    routeStream: 'ALL',
    routePricing: 'ALL',
    expSearch: '',
    expPeriod: 'ALL',
    expCat: 'ALL',
    otSearch: '',
    otStream: 'ALL',
    otDriver: 'ALL'
  };

  let _lastSlicerEq = '';

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

  /* Canonical truck code resolver (handles TB1/Tb7/Tb9/TB8/Tb4/TB3/Tb2 + plates + 3rd party) */
  const KNOWN_BY_PLATE = {
    '360676': 'TB1',
    '364656': 'Tb7',
    '364168': 'Tb9',
    '354578': 'TB8',
    '358943': 'Tb4',
    '358599': 'TB3',
    '365062': 'Tb2'
  };
  const KNOWN_CASE = {
    'TB1': 'TB1',
    'TB2': 'Tb2',
    'TB3': 'TB3',
    'TB4': 'Tb4',
    'TB5': 'TB5',
    'TB6': 'TB6',
    'TB7': 'Tb7',
    'TB8': 'TB8',
    'TB9': 'Tb9'
  };

  function canonTruckCode(rawStr) {
    const s = String(rawStr || '').trim();
    if (!s) return '';
    const up = s.toUpperCase();
    if (KNOWN_CASE[up]) return KNOWN_CASE[up];
    if (KNOWN_BY_PLATE[up]) return KNOWN_BY_PLATE[up];
    for (const [plate, code] of Object.entries(KNOWN_BY_PLATE)) {
      if (up.includes(plate)) return code;
    }
    const prefixMatch = up.match(/^(TB[1-9])\b/);
    if (prefixMatch && KNOWN_CASE[prefixMatch[1]]) return KNOWN_CASE[prefixMatch[1]];
    return s;
  }

  /* Audited Cutover P&L Baseline per Truck (Aug 24 - Oct 23, 2026 · 999 Trips) */
  const CUTOVER_TRUCK_BASE = {
    TB1: {
      code: 'TB1', plate: '360676', owner: 'Karim Bdeir', capacity: 29,
      driver: 'Majed Karam (307) / Ahmad Hamoud (55) / M. Habib (3)',
      activeDays: 52,
      trips: 365, paidTrips: 241, zeroTrips: 124, vol: 10732.7,
      wtcSalesTrips: 51, wtcSalesPaid: 51, wtcSalesZero: 0, wtcSalesVol: 1479.0, wtcSalesRev: 4231.72,
      bbcSalesTrips: 54, bbcSalesPaid: 14, bbcSalesZero: 40, bbcSalesVol: 1581.2, bbcSalesRev: 1595.00,
      wtcRawTrips: 188, wtcRawPaid: 176, wtcRawZero: 12, wtcRawVol: 5452.0, wtcRawRev: 9810.00,
      bbcRawTrips: 72, bbcRawPaid: 0, bbcRawZero: 72, bbcRawVol: 2220.5, bbcRawRev: 0.00,
      salesTrips: 105, salesPaid: 65, salesZero: 40, salesRev: 5826.72,
      rawTrips: 260, rawPaid: 176, rawZero: 84, rawRev: 9810.00,
      strictAdj: 7230.72, strictZeroRemaining: 72,
      fullAdj: 10640.72,
      dieselL: 8232, dieselBillsUsd: 1968.50, dieselTankUsd: 9437.53, dieselCost: 11406.03,
      wtcLoggedL: 8232, wtcFills: 44, bbcLoggedL: 1197, bbcFills: 5, dupL: 1197, dupFills: 5, uniqueBbcUsd: 0,
      lubes: 0.00, repairs: 521.90, insurance: 0.00,
      baseSalary: 2000.00, attOt: 33.33, tripOtPay: 538.00, otTrips: 60, driverPay: 2571.33,
      totalCost: 14499.26
    },
    Tb7: {
      code: 'Tb7', plate: '364656', owner: 'Hussein Bdeir', capacity: 29,
      driver: 'Mohamad Habib (Full 2-Month Period)',
      activeDays: 52,
      trips: 282, paidTrips: 177, zeroTrips: 105, vol: 8160.3,
      wtcSalesTrips: 74, wtcSalesPaid: 74, wtcSalesZero: 0, wtcSalesVol: 2131.6, wtcSalesRev: 5580.42,
      bbcSalesTrips: 63, bbcSalesPaid: 12, bbcSalesZero: 51, bbcSalesVol: 2113.2, bbcSalesRev: 1348.00,
      wtcRawTrips: 106, wtcRawPaid: 91, wtcRawZero: 15, wtcRawVol: 2989.0, wtcRawRev: 5560.00,
      bbcRawTrips: 39, bbcRawPaid: 0, bbcRawZero: 39, bbcRawVol: 926.5, bbcRawRev: 0.00,
      salesTrips: 137, salesPaid: 86, salesZero: 51, salesRev: 6928.42,
      rawTrips: 145, rawPaid: 91, rawZero: 54, rawRev: 5560.00,
      strictAdj: 8275.52, strictZeroRemaining: 19,
      fullAdj: 9901.52,
      dieselL: 8362, dieselBillsUsd: 2990.13, dieselTankUsd: 8244.47, dieselCost: 11536.68,
      wtcLoggedL: 8126, wtcFills: 32, bbcLoggedL: 1420, bbcFills: 6, dupL: 1184, dupFills: 5, uniqueBbcUsd: 302.08,
      lubes: 210.00, repairs: 4206.76, insurance: 547.95,
      baseSalary: 2000.00, attOt: 33.33, tripOtPay: 697.00, otTrips: 81, driverPay: 2730.33,
      totalCost: 19231.72
    },
    Tb9: {
      code: 'Tb9', plate: '364168', owner: 'Jad Bdeir', capacity: 27,
      driver: 'Ali Saleh (Full 2-Month Period)',
      activeDays: 52,
      trips: 352, paidTrips: 316, zeroTrips: 36, vol: 9547.2,
      wtcSalesTrips: 128, wtcSalesPaid: 128, wtcSalesZero: 0, wtcSalesVol: 3413.4, wtcSalesRev: 8126.88,
      bbcSalesTrips: 9, bbcSalesPaid: 4, bbcSalesZero: 5, bbcSalesVol: 260.8, bbcSalesRev: 432.00,
      wtcRawTrips: 201, wtcRawPaid: 184, wtcRawZero: 17, wtcRawVol: 5457.0, wtcRawRev: 9440.00,
      bbcRawTrips: 14, bbcRawPaid: 0, bbcRawZero: 14, bbcRawVol: 416.0, bbcRawRev: 0.00,
      salesTrips: 137, salesPaid: 132, salesZero: 5, salesRev: 8558.88,
      rawTrips: 215, rawPaid: 184, rawZero: 31, rawRev: 9440.00,
      strictAdj: 1390.00, strictZeroRemaining: 9,
      fullAdj: 2238.00,
      dieselL: 4675, dieselBillsUsd: 715.00, dieselTankUsd: 5759.47, dieselCost: 6474.47,
      wtcLoggedL: 4675, wtcFills: 32, bbcLoggedL: 1204, bbcFills: 6, dupL: 1204, dupFills: 6, uniqueBbcUsd: 0,
      lubes: 140.00, repairs: 1839.03, insurance: 0.00,
      baseSalary: 2000.00, attOt: 0.00, tripOtPay: 194.00, otTrips: 31, driverPay: 2194.00,
      totalCost: 10647.50
    }
  };

  const DRIVER_PAYROLL_ROWS = [
    { truck: 'TB1', plate: '360676', driver: 'Majed Karam', period: 'Aug 24 - Oct 15, 2026 (44 / 52 days)', base: 1692.31, attOt: 33.33, otTrips: 51, otPay: 450.00, recorded: 2175.64, note: 'Exact match' },
    { truck: 'TB1', plate: '360676', driver: 'Ahmad Hamoud', period: 'Oct 16 - Oct 23, 2026 (8 / 8 days, pro-rated)', base: 307.69, attOt: 0.00, otTrips: 9, otPay: 88.00, recorded: 395.69, note: 'Exact match' },
    { truck: 'Tb7', plate: '364656', driver: 'Mohamad Habib', period: 'Aug 24 - Oct 23, 2026 (52 / 60 days)', base: 2000.00, attOt: 33.33, otTrips: 81, otPay: 697.00, recorded: 2730.33, note: 'Exact match' },
    { truck: 'Tb9', plate: '364168', driver: 'Ali Saleh', period: 'Aug 24 - Oct 23, 2026 (52 / 60 days)', base: 2000.00, attOt: 0.00, otTrips: 31, otPay: 194.00, recorded: 2194.00, note: 'Verified 31 OT trips ($194.00)' }
  ];

  const LEAKAGE_BUCKETS = [
    {
      cat: '1. Bundled All-In Sales (Sabeh Beton / Partner Sites)',
      TB1: 40, Tb7: 51, Tb9: 5,
      unitEst: 118.3358,
      why: 'Delivered aggregate/concrete price ($19.50-$82/m³) includes delivery, but Transport Charge column was left at $0.00.',
      action: 'Carve out $4.00/m³ internal haulage credit on Sabeh Beton & partner tickets so each truck receives its transport revenue.',
      est: 11360.24,
      pillClass: 'em'
    },
    {
      cat: '2. BBConstruction Inbound Raw Material Haulage Left at $0.00',
      TB1: 72, Tb7: 39, Tb9: 14,
      unitEst: 69.92,
      why: '125 inbound raw material loads hauled into BBConstruction (Sibline) carried $0.00 haulage credit on Bdeir trucks.',
      action: 'Apply standard quarry-to-plant haulage schedule ($50-$80/trip) on BBConstruction raw intake tickets.',
      est: 8740.00,
      pillClass: 'em'
    },
    {
      cat: '3. Aug 24 - Sep 3 Cutover Lag & Missing WTC Raw Route Rates',
      TB1: 12, Tb7: 15, Tb9: 17,
      unitEst: 60.9091,
      why: '44 WTC raw material trips (Spinneys Mar Elias pre-Sep 4 Owner=WTC lag, Oct 12 Sibline Ramel Mrml rule gap, internal quarry transfers) booked $0.',
      action: 'Backdate Truck Ownership Log start date to Aug 24 and add Ramel Mrml product coverage on Sibline $80/trip rule.',
      est: 2680.00,
      pillClass: 'br'
    },
    {
      cat: '4. Thin-Margin Paid Route Review (Short-Haul Transfers)',
      TB1: 11, Tb7: 25, Tb9: 54,
      unitEst: 0,
      why: '90 short-haul paid transfers at $20-$28/trip barely cover round-trip diesel & driver time when overtime applies.',
      action: 'Review short-haul transfer floor ($30-$35/trip) and require >= $55/trip before dispatching overtime runs.',
      est: 0,
      pillClass: 'am'
    }
  ];

  const RECON_FINDINGS = [
    {
      num: 'Finding 1',
      trucks: ['TB1', 'Tb7', 'Tb9'],
      title: 'Overtime Allowance Reconciliation: 172 Verified OT Trips ($1,429.00)',
      severity: 'em',
      badge: '172 OT Trips Verified',
      body: 'Across the Raw Material & Sales trip logs, 172 trips carried verified Overtime allowances (TB1: 60 trips = $538.00, Tb7: 81 trips = $697.00, Tb9: 31 trips = $194.00; Total = $1,429.00), separate from attendance overtime ($66.66).'
    },
    {
      num: 'Finding 2',
      trucks: ['TB1', 'Tb7', 'Tb9'],
      title: '269 Post-Cutover Trips Still Tagged Owner = WTC in Source Logs',
      severity: 'am',
      badge: '269 Stale Owner Tags',
      body: 'Although TB1, Tb7, and Tb9 transferred to Bdeir ownership on August 24, 2026, 269 raw material trips remained tagged Owner = WTC in the raw intake log. Filtering by Truck Code (TB1, Tb7, Tb9) instead of Owner captures 100% of fleet work.'
    },
    {
      num: 'Finding 3',
      trucks: ['TB1', 'Tb7', 'Tb9'],
      title: '3,585 L Cross-Company Diesel Double-Counting Trap ($4,975.26 Over-Cost Risk)',
      severity: 'cr',
      badge: '3,585 L Duplicated Across Logs',
      body: 'Between Sep 24 and Oct 22, 16 diesel fills (3,585 L: TB1 1,197 L, Tb7 1,184 L, Tb9 1,204 L) were recorded in both the WTC Fuel Intake Log and BBConstruction Fuel Log with identical invoice numbers. Only Oct 23 Inv #20719 on Tb7 (236 L = $302.08) is unique.'
    },
    {
      num: 'Finding 4',
      trucks: ['Tb7', 'Tb9'],
      title: '2 Re-Assigned Sales Delivery Tickets (#18886 & #15089 = +$135.01 Variance)',
      severity: 'br',
      badge: '2 Tickets Re-Assigned',
      body: 'Bon #18886 (Aug 27, 2026, Sabeh Beton, 30.25 m³, $55.01 transport) was re-assigned from Tb7 to Tb4, and Bon #15089 (Sep 8, 2026, Sibline, 26.9 m³, $80.00 transport) from Tb9 to TB12. Both are preserved in the 999-trip Cutover Audit.'
    }
  ];

  /* Master Frequency-Ranked Truck Catalog from SEED.records (Hard Rule #11 / 7z-freq) */
  let _catCacheKey = null;
  let _catCacheList = null;

  function getMasterTruckCatalog() {
    const recs = (window.MFG_SEED && window.MFG_SEED.records) || {};
    const eqList = recs.equipment || [];
    const salesAll = recs.sales_tickets || [];
    const rawAll = recs.raw_purchases || [];
    const cacheKey = eqList.length + ':' + salesAll.length + ':' + rawAll.length + ':' + state.scope;
    if (_catCacheKey === cacheKey && _catCacheList) return _catCacheList;

    const map = new Map();
    const ensureEntry = (code) => {
      if (!code) return null;
      const c = canonTruckCode(code);
      if (!c) return null;
      if (!map.has(c)) {
        const base = CUTOVER_TRUCK_BASE[c];
        map.set(c, {
          code: c,
          plate: base ? base.plate : c,
          owner: base ? base.owner : '',
          ownership: BDEIR_CODES.includes(c) ? 'Bdeir Fleet' : (WTC_OWN_CODES.includes(c) ? 'Own' : 'Third Party'),
          driver: base ? base.driver : '',
          type: 'Truck',
          liveTrips: 0,
          cutoverTrips: base ? base.trips : 0,
          isBdeir3: BDEIR_CODES.includes(c),
          isWtcOwn: WTC_OWN_CODES.includes(c),
          isCore7: CORE7_CODES.includes(c),
          isBdeirFamily: BDEIR_CODES.includes(c)
        });
      }
      return map.get(c);
    };

    BDEIR_CODES.forEach(ensureEntry);
    WTC_OWN_CODES.forEach(ensureEntry);

    for (const eq of eqList) {
      if (eq.voided) continue;
      const typ = String(eq.type || 'Truck');
      const code = canonTruckCode(eq.name || eq.plate_no);
      if (!code) continue;
      if (!/truck|camion|danbar|shacman|actros|mercedes/i.test(typ + ' ' + code) && !CORE7_CODES.includes(code)) continue;
      const item = ensureEntry(code);
      if (!item) continue;
      if (eq.plate_no && (!CUTOVER_TRUCK_BASE[code])) item.plate = String(eq.plate_no);
      if (eq.supplier && !CUTOVER_TRUCK_BASE[code]) item.owner = String(eq.supplier);
      if (eq.ownership && !BDEIR_CODES.includes(code)) item.ownership = String(eq.ownership);
      if (eq.default_driver && !CUTOVER_TRUCK_BASE[code]) item.driver = String(eq.default_driver);
      if (/bdeir/i.test(String(eq.supplier || '') + ' ' + String(eq.name || ''))) {
        item.isBdeirFamily = true;
      }
      if (/^own/i.test(String(eq.ownership || '')) && WTC_OWN_CODES.includes(code)) {
        item.isWtcOwn = true;
      }
    }

    for (const r of salesAll) {
      if (r.voided) continue;
      const c = canonTruckCode(r.truck || r.equipment);
      if (!c) continue;
      const item = ensureEntry(c);
      if (item) {
        item.liveTrips++;
        if (!item.owner && r.truck_owner) item.owner = String(r.truck_owner);
        if (!item.driver && r.driver) item.driver = String(r.driver);
        if (/bdeir/i.test(String(r.truck_owner || ''))) item.isBdeirFamily = true;
      }
    }

    for (const r of rawAll) {
      if (r.voided) continue;
      const c = canonTruckCode(r.truck || r.equipment);
      if (!c) continue;
      const item = ensureEntry(c);
      if (item) {
        item.liveTrips++;
        if (!item.owner && r.truck_owner) item.owner = String(r.truck_owner);
        if (!item.driver && r.driver) item.driver = String(r.driver);
        if (/bdeir/i.test(String(r.truck_owner || ''))) item.isBdeirFamily = true;
      }
    }

    const active = Array.from(map.values()).filter(t => t.liveTrips > 0 || t.cutoverTrips > 0 || t.isCore7);
    /* Strict operational usage frequency descending (never alphabetical) */
    active.sort((a, b) => {
      const fa = state.scope === 'cutover' && a.isBdeir3 ? a.cutoverTrips : a.liveTrips;
      const fb = state.scope === 'cutover' && b.isBdeir3 ? b.cutoverTrips : b.liveTrips;
      if (fb !== fa) return fb - fa;
      return (b.liveTrips - a.liveTrips) || (b.cutoverTrips - a.cutoverTrips);
    });

    _catCacheKey = cacheKey;
    _catCacheList = active;
    return active;
  }

  /* Frequency-First search: exact matches first, then pre-sorted frequency order (7z-freq) */
  function searchTruckCatalog(catalog, rawQuery) {
    const q = String(rawQuery || '').trim().toLowerCase();
    if (!q) return catalog;
    const exact = [];
    const freqOrdered = [];
    for (const item of catalog) {
      const codeLo = item.code.toLowerCase();
      const plateLo = String(item.plate || '').toLowerCase();
      if (codeLo === q || plateLo === q) {
        exact.push(item);
      } else {
        const hay = codeLo + ' ' + plateLo + ' ' + String(item.owner || '').toLowerCase() + ' ' + String(item.driver || '').toLowerCase() + ' ' + String(item.ownership || '').toLowerCase();
        if (hay.includes(q)) freqOrdered.push(item);
      }
    }
    return exact.concat(freqOrdered);
  }

  function getCohortCodes(cohortKey, catalog) {
    const cat = catalog || getMasterTruckCatalog();
    if (cohortKey === 'bdeir') {
      return cat.filter(t => t.isBdeir3).map(t => t.code);
    }
    if (cohortKey === 'wtc_own') {
      const list = cat.filter(t => WTC_OWN_CODES.includes(t.code)).map(t => t.code);
      return list.length ? list : WTC_OWN_CODES.slice();
    }
    if (cohortKey === 'core7') {
      const list = cat.filter(t => t.isCore7).map(t => t.code);
      return list.length ? list : CORE7_CODES.slice();
    }
    if (cohortKey === 'family') {
      const list = cat.filter(t => t.isBdeirFamily && (t.liveTrips > 0 || t.cutoverTrips > 0)).map(t => t.code);
      return list.length ? list : BDEIR_CODES.slice();
    }
    if (cohortKey === 'all') {
      return cat.slice(0, 18).map(t => t.code);
    }
    return state.selectedTrucks.slice();
  }

  function normalizeSelectedTrucks() {
    if (!Array.isArray(state.selectedTrucks) || state.selectedTrucks.length === 0) {
      state.selectedTrucks = getCohortCodes(state.cohort === 'custom' ? 'bdeir' : state.cohort);
    }
    const dedup = [];
    for (const raw of state.selectedTrucks) {
      const c = canonTruckCode(raw);
      if (c && !dedup.includes(c)) dedup.push(c);
    }
    if (!dedup.length) dedup.push('TB1', 'Tb7', 'Tb9');
    state.selectedTrucks = dedup;

    const hasNonBdeir = state.selectedTrucks.some(c => !BDEIR_CODES.includes(c));
    if (hasNonBdeir || state.coFilter === 'Lions Transport') {
      state.scope = 'live';
    }
  }

  function applyCohort(cohortKey) {
    state.cohort = cohortKey;
    if (cohortKey !== 'bdeir') {
      state.scope = 'live';
    }
    const cat = getMasterTruckCatalog();
    state.selectedTrucks = getCohortCodes(cohortKey, cat);
    normalizeSelectedTrucks();
  }

  function matchCoFilter(recordCo) {
    if (!state.coFilter || state.coFilter === 'ALL') return true;
    const rc = String(recordCo || '').trim().toLowerCase();
    const fc = state.coFilter.toLowerCase();
    if (fc === 'bbconstruction') return rc.includes('bbc');
    if (fc === 'wtc') return rc === 'wtc' || (!rc.includes('bbc') && !rc.includes('lion'));
    if (fc === 'lions transport') return rc.includes('lion');
    return rc === fc;
  }

  /* ==========================================================================
     1. Cutover Model Builder (Dynamic Per-Truck & Per-Company Filtering!)
     ========================================================================== */
  function buildCutoverTruckEntry(code) {
    const b = CUTOVER_TRUCK_BASE[code];
    if (!b) return null;
    const co = state.coFilter || 'ALL';
    const isWtcOnly = co === 'WTC';
    const isBbcOnly = co === 'BBConstruction';

    const salesTrips = isWtcOnly ? b.wtcSalesTrips : (isBbcOnly ? b.bbcSalesTrips : b.salesTrips);
    const salesPaid = isWtcOnly ? b.wtcSalesPaid : (isBbcOnly ? b.bbcSalesPaid : b.salesPaid);
    const salesZero = isWtcOnly ? b.wtcSalesZero : (isBbcOnly ? b.bbcSalesZero : b.salesZero);
    const salesRev = isWtcOnly ? b.wtcSalesRev : (isBbcOnly ? b.bbcSalesRev : b.salesRev);
    const salesVol = isWtcOnly ? b.wtcSalesVol : (isBbcOnly ? b.bbcSalesVol : (b.wtcSalesVol + b.bbcSalesVol));

    const rawTrips = isWtcOnly ? b.wtcRawTrips : (isBbcOnly ? b.bbcRawTrips : b.rawTrips);
    const rawPaid = isWtcOnly ? b.wtcRawPaid : (isBbcOnly ? b.bbcRawPaid : b.rawPaid);
    const rawZero = isWtcOnly ? b.wtcRawZero : (isBbcOnly ? b.bbcRawZero : b.rawZero);
    const rawRev = isWtcOnly ? b.wtcRawRev : (isBbcOnly ? b.bbcRawRev : b.rawRev);
    const rawVol = isWtcOnly ? b.wtcRawVol : (isBbcOnly ? b.bbcRawVol : (b.wtcRawVol + b.bbcRawVol));

    const trips = salesTrips + rawTrips;
    const paidTrips = salesPaid + rawPaid;
    const recZeroTrips = salesZero + rawZero;
    const vol = salesVol + rawVol;

    let fullAdj = b.fullAdj;
    let strictAdj = b.strictAdj;
    if (co !== 'ALL') {
      fullAdj = CUTOVER_DATA.zero_haulage_groups
        .filter(z => z.truck === code && z.co === co)
        .reduce((s, z) => s + (Number(z.est_missing) || 0), 0);
      const ratio = b.fullAdj > 0 ? (b.strictAdj / b.fullAdj) : 0;
      strictAdj = isBbcOnly ? (b.bbcSalesZero > 0 ? CUTOVER_DATA.zero_haulage_groups.filter(z => z.truck === code && z.co === 'BBConstruction' && z.stream.startsWith('Sales')).reduce((s, z) => s + (Number(z.est_missing) || 0), 0) : fullAdj * ratio) : (fullAdj * ratio);
    }

    const adjRev = state.mode === 'recorded' ? 0 : (state.mode === 'strict' ? strictAdj : fullAdj);
    const zeroTrips = state.mode === 'recorded' ? recZeroTrips : (state.mode === 'full' ? 0 : (co === 'ALL' ? b.strictZeroRemaining : Math.round(recZeroTrips * (b.strictZeroRemaining / Math.max(1, b.zeroTrips)))));
    const effPaidTrips = trips - zeroTrips;

    const costShare = co === 'ALL' ? 1 : (b.trips > 0 ? (trips / b.trips) : 0);
    const dieselL = Math.round(b.dieselL * costShare);
    const dieselCost = b.dieselCost * costShare;
    const lubes = b.lubes * costShare;
    const repairs = b.repairs * costShare;
    const insurance = b.insurance * costShare;
    const driverPay = b.driverPay * costShare;
    const totalCost = b.totalCost * costShare;
    const totalRev = salesRev + rawRev + adjRev;
    const netProfit = totalRev - totalCost;
    const pctNum = totalRev > 0 ? ((netProfit / totalRev) * 100) : 0;
    const marginPct = (netProfit >= 0 ? '+' : '') + pctNum.toFixed(1) + '%';
    const statusClass = netProfit > 500 ? 'em' : (netProfit >= 0 ? 'am' : 'cr');

    return {
      code: b.code,
      plate: b.plate,
      owner: b.owner,
      driver: b.driver,
      activeDays: b.activeDays,
      trips,
      paidTrips: effPaidTrips,
      recPaidTrips: paidTrips,
      zeroTrips,
      recZeroTrips,
      vol,
      wtcTrips: isBbcOnly ? 0 : (b.wtcSalesTrips + b.wtcRawTrips),
      bbcTrips: isWtcOnly ? 0 : (b.bbcSalesTrips + b.bbcRawTrips),
      wtcVol: isBbcOnly ? 0 : (b.wtcSalesVol + b.wtcRawVol),
      bbcVol: isWtcOnly ? 0 : (b.bbcSalesVol + b.bbcRawVol),
      salesTrips, salesPaid, salesZero, salesRev, salesVol,
      rawTrips, rawPaid, rawZero, rawRev, rawVol,
      adjRev,
      strictAdj,
      fullAdj,
      totalRev,
      dieselL,
      dieselCost,
      lubes,
      repairs,
      insurance,
      driverPay,
      otTrips: co === 'ALL' ? b.otTrips : CUTOVER_DATA.ot_list.filter(o => o.truck === code && o.co === co).length,
      totalCost,
      netProfit,
      marginPct,
      statusClass
    };
  }

  function computeCutoverModel() {
    const activeCodes = state.selectedTrucks.filter(c => BDEIR_CODES.includes(c));
    const codes = activeCodes.length ? activeCodes : BDEIR_CODES.slice();
    const trucks = {};
    let totalTrips = 0, wtcTrips = 0, bbcTrips = 0, totalVol = 0, wtcVol = 0, bbcVol = 0;
    let transRev = 0, salesRev = 0, rawRev = 0, adjRev = 0, totalCost = 0, zeroTrips = 0, recZeroTrips = 0;

    for (const c of codes) {
      const tr = buildCutoverTruckEntry(c);
      trucks[c] = tr;
      totalTrips += tr.trips;
      wtcTrips += tr.wtcTrips;
      bbcTrips += tr.bbcTrips;
      totalVol += tr.vol;
      wtcVol += tr.wtcVol;
      bbcVol += tr.bbcVol;
      salesRev += tr.salesRev;
      rawRev += tr.rawRev;
      adjRev += tr.adjRev;
      transRev += tr.totalRev;
      totalCost += tr.totalCost;
      zeroTrips += tr.zeroTrips;
      recZeroTrips += tr.recZeroTrips;
    }

    const netProfit = transRev - totalCost;
    const marginPct = transRev > 0 ? (((netProfit / transRev) * 100).toFixed(1) + '%') : '0.0%';
    const modeLabel = state.mode === 'recorded'
      ? '1. Recorded Ledger P&L'
      : (state.mode === 'strict' ? '2. Strict Adjusted P&L' : '3. Full Commercial Benchmark P&L');

    const revSub = state.mode === 'recorded'
      ? ('Sales Delivery: ' + fmtUSD(salesRev) + ' | Raw Haulage: ' + fmtUSD(rawRev) + (state.coFilter !== 'ALL' ? ' (' + state.coFilter + ')' : ''))
      : ('Recorded ' + fmtUSD(salesRev + rawRev) + ' + ' + fmtUSD(adjRev) + ' Missing/Unbundled Credit');

    const zeroPct = totalTrips > 0 ? ((recZeroTrips / totalTrips) * 100).toFixed(1) : '0.0';
    const zeroSub = state.mode === 'recorded'
      ? (zeroPct + '% of selected trips booked at $0.00 (' + fmtInt(recZeroTrips) + ' unpaid trips)')
      : (state.mode === 'strict'
        ? ('External/partner $0 trips credited (+' + fmtUSD(adjRev) + '); ' + fmtInt(zeroTrips) + ' internal quarry kept at $0')
        : ('All ' + fmtInt(recZeroTrips) + ' $0.00 trips credited at commercial haulage rates (+' + fmtUSD(adjRev) + ')'));

    return {
      isLive: false,
      key: state.mode,
      label: modeLabel,
      codes,
      trucks,
      totalTrips,
      wtcTrips,
      bbcTrips,
      totalVol,
      wtcVol,
      bbcVol,
      transRev,
      revSub,
      totalCost,
      costPerTrip: totalTrips > 0 ? (totalCost / totalTrips) : 0,
      costPerM3: totalVol > 0 ? (totalCost / totalVol) : 0,
      netProfit,
      marginPct,
      netPerTrip: totalTrips > 0 ? (netProfit / totalTrips) : 0,
      zeroTrips,
      recZeroTrips,
      zeroSub
    };
  }

  /* ==========================================================================
     2. Live Dynamic Dataset Builder (Works for ANY Truck in ISABI SEED.records!)
     ========================================================================== */
  function computeLiveDataset() {
    const catalog = getMasterTruckCatalog();
    const catByCode = new Map(catalog.map(t => [t.code, t]));
    const codes = state.selectedTrucks.slice();
    const selectedSet = new Set(codes);

    const recs = (window.MFG_SEED && window.MFG_SEED.records) || {};
    const sales = typeof window.scopedRecords === 'function' ? window.scopedRecords('sales_tickets') : (recs.sales_tickets || []);
    const raw = typeof window.scopedRecords === 'function' ? window.scopedRecords('raw_purchases') : (recs.raw_purchases || []);
    const diesel = typeof window.scopedRecords === 'function' ? window.scopedRecords('fuel_intakes') : (recs.fuel_intakes || []);
    const oils = typeof window.scopedRecords === 'function' ? window.scopedRecords('equipment_oil_logs') : (recs.equipment_oil_logs || []);
    const maint = typeof window.scopedRecords === 'function' ? window.scopedRecords('equipment_repairs') : (recs.equipment_repairs || []);
    const exps = typeof window.scopedRecords === 'function' ? window.scopedRecords('expenses') : (recs.expenses || []);

    const trucks = {};
    const activeDatesByTruck = {};
    for (const c of codes) {
      const meta = catByCode.get(c) || { code: c, plate: c, owner: 'Fleet Hauler', ownership: 'Third Party', driver: 'Assigned Driver' };
      const isCompanyOrBdeir = BDEIR_CODES.includes(c) || WTC_OWN_CODES.includes(c) || /^own/i.test(meta.ownership || '');
      trucks[c] = {
        code: c,
        plate: meta.plate || c,
        owner: meta.owner || meta.ownership || 'Hauler',
        ownership: meta.ownership || 'Third Party',
        driver: meta.driver || 'Assigned Driver',
        activeDays: 0,
        trips: 0, paidTrips: 0, recPaidTrips: 0, zeroTrips: 0, recZeroTrips: 0, vol: 0,
        wtcTrips: 0, bbcTrips: 0, wtcVol: 0, bbcVol: 0,
        wtcSalesTrips: 0, wtcSalesPaid: 0, wtcSalesZero: 0, wtcSalesVol: 0, wtcSalesRev: 0,
        bbcSalesTrips: 0, bbcSalesPaid: 0, bbcSalesZero: 0, bbcSalesVol: 0, bbcSalesRev: 0,
        wtcRawTrips: 0, wtcRawPaid: 0, wtcRawZero: 0, wtcRawVol: 0, wtcRawRev: 0,
        bbcRawTrips: 0, bbcRawPaid: 0, bbcRawZero: 0, bbcRawVol: 0, bbcRawRev: 0,
        salesTrips: 0, salesPaid: 0, salesZero: 0, salesRev: 0, salesVol: 0,
        rawTrips: 0, rawPaid: 0, rawZero: 0, rawRev: 0, rawVol: 0,
        strictAdj: 0, fullAdj: 0, adjRev: 0, totalRev: 0,
        dieselL: 0, dieselCost: 0, lubes: 0, repairs: 0, insurance: 0,
        driverPay: 0, otTrips: 0, otPay: 0,
        isCompanyOrBdeir,
        totalCost: 0, netProfit: 0, marginPct: '0.0%', statusClass: 'am'
      };
      activeDatesByTruck[c] = new Set();
    }

    const routeMap = new Map();
    const zeroGroupMap = new Map();
    const liveExpenses = [];
    const liveOtList = [];

    for (const r of sales) {
      if (r.voided) continue;
      if (!matchCoFilter(r.company)) continue;
      const c = canonTruckCode(r.truck || r.truck_code || r.equipment);
      if (!c || !selectedSet.has(c)) continue;
      const t = trucks[c];
      const q = Number(r.qty != null ? r.qty : r.qty_m3) || 0;
      const tr = Number(r.trans_price != null ? r.trans_price : r.trans_total_usd) || 0;
      const dt = String(r.date || r.rep_date || '').slice(0, 10);
      if (dt) activeDatesByTruck[c].add(dt);
      if (r.driver && t.driver === 'Assigned Driver') t.driver = String(r.driver);

      const co = String(r.company || 'WTC');
      const isBbc = co.toLowerCase().includes('bbc');
      const isPaid = tr > 0.001;
      const estMiss = isPaid ? 0 : (q > 0 ? q * 4.0 : 75.0);

      t.trips++;
      t.salesTrips++;
      t.vol += q;
      t.salesVol += q;
      t.salesRev += tr;
      if (isPaid) { t.recPaidTrips++; t.salesPaid++; }
      else {
        t.recZeroTrips++;
        t.salesZero++;
        t.strictAdj += estMiss;
        t.fullAdj += estMiss;
      }
      if (isBbc) {
        t.bbcTrips++; t.bbcVol += q; t.bbcSalesTrips++; t.bbcSalesVol += q; t.bbcSalesRev += tr;
        if (isPaid) t.bbcSalesPaid++; else t.bbcSalesZero++;
      } else {
        t.wtcTrips++; t.wtcVol += q; t.wtcSalesTrips++; t.wtcSalesVol += q; t.wtcSalesRev += tr;
        if (isPaid) t.wtcSalesPaid++; else t.wtcSalesZero++;
      }

      const otFlag = Number(r.overtime) || 0;
      if (otFlag > 0) {
        const otAmt = otFlag >= 2 ? 26 : 13;
        t.otTrips++;
        t.otPay += otAmt;
        liveOtList.push({
          date: dt, truck: c, co, stream: 'Sales Delivery',
          inv: String(r.ticket_no || r.name || ''),
          counterparty: String(r.customer || '-'),
          site: String(r.site || r.customer || '-'),
          product: String(r.product || '-'),
          driver: String(r.driver || t.driver || '-'),
          vol: q, trans_rev: tr, region: co, ot_allow: otAmt
        });
      }

      const rKey = 'S|' + c + '|' + co + '|' + (r.customer || '') + '|' + (r.site || '') + '|' + (r.product || '');
      let rg = routeMap.get(rKey);
      if (!rg) {
        rg = {
          stream: 'Sales Delivery', truck: c, co,
          party: String(r.customer || '-'),
          site: String(r.site || '-'),
          site_label: (r.customer || 'Customer') + (r.site ? ' (' + r.site + ')' : ''),
          product: String(r.product || '-'),
          trips: 0, paid_trips: 0, zero_trips: 0, ot_trips: 0,
          vol: 0, trans_rev: 0, est_missing: 0,
          first_dt: dt, last_dt: dt, drivers: String(r.driver || t.driver || '')
        };
        routeMap.set(rKey, rg);
      }
      rg.trips++;
      if (isPaid) rg.paid_trips++; else { rg.zero_trips++; rg.est_missing += estMiss; }
      if (otFlag > 0) rg.ot_trips++;
      rg.vol += q;
      rg.trans_rev += tr;
      if (dt && (!rg.first_dt || dt < rg.first_dt)) rg.first_dt = dt;
      if (dt && (!rg.last_dt || dt > rg.last_dt)) rg.last_dt = dt;

      if (!isPaid) {
        let zg = zeroGroupMap.get(rKey);
        if (!zg) {
          zg = {
            stream: 'Sales ($0)', co, truck: c,
            counterparty: String(r.customer || '-'),
            site: String(r.site || '-'),
            product: String(r.product || '-'),
            zero_trips: 0, total_route_trips: 0, zero_vol: 0,
            first_dt: dt, last_dt: dt, est_missing: 0,
            reason: 'Sales delivery ticket with $0.00 transport split; benchmarked at $4.00/m³.',
            bons: []
          };
          zeroGroupMap.set(rKey, zg);
        }
        zg.zero_trips++;
        zg.zero_vol += q;
        zg.est_missing += estMiss;
        if (dt && (!zg.first_dt || dt < zg.first_dt)) zg.first_dt = dt;
        if (dt && (!zg.last_dt || dt > zg.last_dt)) zg.last_dt = dt;
        if (zg.bons.length < 12 && r.ticket_no) zg.bons.push(String(r.ticket_no));
      }
    }

    for (const r of raw) {
      if (r.voided) continue;
      if (!matchCoFilter(r.company)) continue;
      const c = canonTruckCode(r.truck || r.truck_code || r.equipment);
      if (!c || !selectedSet.has(c)) continue;
      const t = trucks[c];
      const q = Number(r.qty != null ? r.qty : r.qty_m3) || 0;
      const tr = Number(r.trans_cost != null ? r.trans_cost : r.transport_usd) || 0;
      const dt = String(r.date || r.rep_date || '').slice(0, 10);
      if (dt) activeDatesByTruck[c].add(dt);
      if (r.driver && t.driver === 'Assigned Driver') t.driver = String(r.driver);

      const co = String(r.company || 'WTC');
      const isBbc = co.toLowerCase().includes('bbc');
      const isPaid = tr > 0.001;
      const isInternalQuarry = /als*jawad|wtc/i.test(String(r.site || '') + ' ' + String(r.site_owner || ''));
      const estMiss = isPaid ? 0 : 60.0;

      t.trips++;
      t.rawTrips++;
      t.vol += q;
      t.rawVol += q;
      t.rawRev += tr;
      if (isPaid) { t.recPaidTrips++; t.rawPaid++; }
      else {
        t.recZeroTrips++;
        t.rawZero++;
        t.fullAdj += estMiss;
        if (!isInternalQuarry) t.strictAdj += estMiss;
      }
      if (isBbc) {
        t.bbcTrips++; t.bbcVol += q; t.bbcRawTrips++; t.bbcRawVol += q; t.bbcRawRev += tr;
        if (isPaid) t.bbcRawPaid++; else t.bbcRawZero++;
      } else {
        t.wtcTrips++; t.wtcVol += q; t.wtcRawTrips++; t.wtcRawVol += q; t.wtcRawRev += tr;
        if (isPaid) t.wtcRawPaid++; else t.wtcRawZero++;
      }

      const otFlag = Number(r.overtime) || 0;
      if (otFlag > 0) {
        const otAmt = otFlag >= 2 ? 26 : 13;
        t.otTrips++;
        t.otPay += otAmt;
        liveOtList.push({
          date: dt, truck: c, co, stream: 'Raw Material',
          inv: String(r.ticket_no || r.name || ''),
          counterparty: String(r.site_owner || '-'),
          site: String(r.site || '-'),
          product: String(r.product || '-'),
          driver: String(r.driver || t.driver || '-'),
          vol: q, trans_rev: tr, region: co, ot_allow: otAmt
        });
      }

      const rKey = 'R|' + c + '|' + co + '|' + (r.site_owner || '') + '|' + (r.site || '') + '|' + (r.product || '');
      let rg = routeMap.get(rKey);
      if (!rg) {
        rg = {
          stream: 'Raw Material', truck: c, co,
          party: String(r.site_owner || '-'),
          site: String(r.site || '-'),
          site_label: (r.site || 'Quarry') + (r.site_owner ? ' (' + r.site_owner + ')' : ''),
          product: String(r.product || '-'),
          trips: 0, paid_trips: 0, zero_trips: 0, ot_trips: 0,
          vol: 0, trans_rev: 0, est_missing: 0,
          first_dt: dt, last_dt: dt, drivers: String(r.driver || t.driver || '')
        };
        routeMap.set(rKey, rg);
      }
      rg.trips++;
      if (isPaid) rg.paid_trips++; else { rg.zero_trips++; rg.est_missing += estMiss; }
      if (otFlag > 0) rg.ot_trips++;
      rg.vol += q;
      rg.trans_rev += tr;
      if (dt && (!rg.first_dt || dt < rg.first_dt)) rg.first_dt = dt;
      if (dt && (!rg.last_dt || dt > rg.last_dt)) rg.last_dt = dt;

      if (!isPaid) {
        let zg = zeroGroupMap.get(rKey);
        if (!zg) {
          zg = {
            stream: 'Raw ($0)', co, truck: c,
            counterparty: String(r.site_owner || '-'),
            site: String(r.site || '-'),
            product: String(r.product || '-'),
            zero_trips: 0, total_route_trips: 0, zero_vol: 0,
            first_dt: dt, last_dt: dt, est_missing: 0,
            reason: isInternalQuarry
              ? 'Internal quarry /company-fleet transfer ($0 external AP; $60/trip commercial shadow rate).'
              : 'Inbound raw material haulage recorded at $0.00; benchmarked at $60.00/trip.',
            bons: []
          };
          zeroGroupMap.set(rKey, zg);
        }
        zg.zero_trips++;
        zg.zero_vol += q;
        zg.est_missing += estMiss;
        if (dt && (!zg.first_dt || dt < zg.first_dt)) zg.first_dt = dt;
        if (dt && (!zg.last_dt || dt > zg.last_dt)) zg.last_dt = dt;
        if (zg.bons.length < 12 && r.ticket_no) zg.bons.push(String(r.ticket_no));
      }
    }

    for (const [rKey, zg] of zeroGroupMap.entries()) {
      const rg = routeMap.get(rKey);
      zg.total_route_trips = rg ? rg.trips : zg.zero_trips;
      zg.dates = (zg.first_dt || '-') + ' to ' + (zg.last_dt || '-');
      zg.all_invoices = zg.bons.join(', ');
    }

    /* De-duplicate cross-company diesel fills by (truck, date, ticket_no, litres) */
    const seenDieselKeys = new Set();
    for (const r of diesel) {
      if (r.voided) continue;
      if (!matchCoFilter(r.company)) continue;
      const c = canonTruckCode(r.equipment || r.truck);
      if (!c || !selectedSet.has(c)) continue;
      if (!/diesel|mazout/i.test(String(r.item || r.fuel_type || 'Diesel'))) continue;
      const l = Number(r.litres != null ? r.litres : r.liters) || 0;
      if (l <= 0) continue;
      const dt = String(r.date || '').slice(0, 10);
      const tno = String(r.ticket_no || '');
      const dedupKey = c + '|' + dt + '|' + tno + '|' + Math.round(l);
      if (tno && seenDieselKeys.has(dedupKey)) continue;
      if (tno) seenDieselKeys.add(dedupKey);

      const unitRate = 1.3878;
      const cost = Number(r.total_usd || r.cost_usd) || (l * unitRate);
      trucks[c].dieselL += l;
      trucks[c].dieselCost += cost;
      liveExpenses.push({
        date: dt, is_post: dt >= '2026-08-24', truck: c, co: String(r.company || 'WTC'),
        inv: tno || String(r.name || ''), cat: 'Fuel', sub: 'Bulk Tank / Diesel Intake',
        supplier: String(r.location || (r.company || 'WTC') + ' Diesel Tank'),
        qty: l, unit_cost: l > 0 ? (cost / l) : unitRate, total: cost,
        notes: r.driver ? ('Driver: ' + r.driver) : 'Diesel intake'
      });
    }

    for (const r of oils) {
      if (r.voided) continue;
      if (!matchCoFilter(r.company)) continue;
      const c = canonTruckCode(r.equipment || r.truck);
      if (!c || !selectedSet.has(c)) continue;
      const q = Number(r.qty) || 0;
      const cost = Number(r.cost_usd || r.total_usd) || (q * 3.5);
      trucks[c].lubes += cost;
      const dt = String(r.date || r.rep_date || '').slice(0, 10);
      liveExpenses.push({
        date: dt, is_post: dt >= '2026-08-24', truck: c, co: String(r.company || 'WTC'),
        inv: String(r.name || ''), cat: 'Oils & Lubricants', sub: String(r.oil_type || 'Lubricant'),
        supplier: String(r.source || 'Plant Lube Bay'),
        qty: q, unit_cost: q > 0 ? (cost / q) : 0, total: cost,
        notes: String(r.notes || r.service_action || '')
      });
    }

    for (const r of maint) {
      if (r.voided) continue;
      if (!matchCoFilter(r.company)) continue;
      const c = canonTruckCode(r.equipment || r.truck);
      if (!c || !selectedSet.has(c)) continue;
      const cost = Number(r.total_cost_usd || r.cost_usd) || 0;
      trucks[c].repairs += cost;
      const dt = String(r.date || r.rep_date || '').slice(0, 10);
      liveExpenses.push({
        date: dt, is_post: dt >= '2026-08-24', truck: c, co: String(r.company || 'WTC'),
        inv: String(r.name || ''), cat: 'Repairs & Maintenance', sub: String(r.subsystem || 'Workshop'),
        supplier: String(r.supplier || r.repair_source || 'Workshop'),
        qty: 1, unit_cost: cost, total: cost,
        notes: String(r.items_summary || r.notes || '')
      });
    }

    for (const r of exps) {
      if (r.voided) continue;
      if (!matchCoFilter(r.company)) continue;
      const c = canonTruckCode(r.equipment || r.truck);
      if (!c || !selectedSet.has(c)) continue;
      const catStr = String(r.category || 'Repairs & Maintenance');
      const subStr = String(r.subcategory || '');
      if (/diesel|mazout/i.test(catStr + ' ' + subStr)) continue;
      const cost = Number(r.amount || r.total_usd || r.total) || 0;
      if (/insur/i.test(catStr + ' ' + subStr)) trucks[c].insurance += cost;
      else trucks[c].repairs += cost;
      const dt = String(r.date || r.rep_date || '').slice(0, 10);
      const q = Number(r.qty) || 1;
      liveExpenses.push({
        date: dt, is_post: dt >= '2026-08-24', truck: c, co: String(r.company || 'WTC'),
        inv: String(r.reference || r.name || ''), cat: catStr, sub: subStr || 'Direct Voucher',
        supplier: String(r.supplier || '-'),
        qty: q, unit_cost: q > 0 ? (cost / q) : cost, total: cost,
        notes: String(r.item_summary || '')
      });
    }

    let totalTrips = 0, wtcTrips = 0, bbcTrips = 0, totalVol = 0, wtcVol = 0, bbcVol = 0;
    let transRev = 0, salesRev = 0, rawRev = 0, adjRev = 0, totalCost = 0, zeroTrips = 0, recZeroTrips = 0;

    for (const c of codes) {
      const t = trucks[c];
      t.activeDays = activeDatesByTruck[c].size;
      if (t.isCompanyOrBdeir && t.activeDays > 0) {
        /* $1,000/month (~$38.46/active day) base driver allocation + verified trip OT */
        t.driverPay = Math.round(t.activeDays * 38.4615 * 100) / 100 + t.otPay;
      } else {
        t.driverPay = t.otPay;
      }
      t.adjRev = state.mode === 'recorded' ? 0 : (state.mode === 'strict' ? t.strictAdj : t.fullAdj);
      t.zeroTrips = state.mode === 'recorded' ? t.recZeroTrips : (state.mode === 'full' ? 0 : Math.max(0, t.recZeroTrips - Math.round(t.strictAdj / 60)));
      t.paidTrips = Math.max(0, t.trips - t.zeroTrips);
      t.totalRev = t.salesRev + t.rawRev + t.adjRev;
      t.totalCost = t.dieselCost + t.lubes + t.repairs + t.insurance + t.driverPay;
      t.netProfit = t.totalRev - t.totalCost;
      const pctNum = t.totalRev > 0 ? ((t.netProfit / t.totalRev) * 100) : 0;
      t.marginPct = (t.netProfit >= 0 ? '+' : '') + pctNum.toFixed(1) + '%';
      t.statusClass = t.netProfit > 500 ? 'em' : (t.netProfit >= 0 ? 'am' : 'cr');

      totalTrips += t.trips;
      wtcTrips += t.wtcTrips;
      bbcTrips += t.bbcTrips;
      totalVol += t.vol;
      wtcVol += t.wtcVol;
      bbcVol += t.bbcVol;
      salesRev += t.salesRev;
      rawRev += t.rawRev;
      adjRev += t.adjRev;
      transRev += t.totalRev;
      totalCost += t.totalCost;
      zeroTrips += t.zeroTrips;
      recZeroTrips += t.recZeroTrips;
    }

    liveExpenses.sort((a, b) => (a.date < b.date ? 1 : (a.date > b.date ? -1 : 0)));
    liveOtList.sort((a, b) => (a.date < b.date ? 1 : (a.date > b.date ? -1 : 0)));

    const netProfit = transRev - totalCost;
    const marginPct = transRev > 0 ? (((netProfit / transRev) * 100).toFixed(1) + '%') : '0.0%';

    return {
      isLive: true,
      key: state.mode,
      label: 'Live Dynamic Fleet P&L (' + codes.length + (codes.length === 1 ? ' Truck' : ' Trucks') + ')',
      codes,
      trucks,
      totalTrips,
      wtcTrips,
      bbcTrips,
      totalVol,
      wtcVol,
      bbcVol,
      transRev,
      revSub: state.mode === 'recorded'
        ? ('Sales Delivery: ' + fmtUSD(salesRev) + ' | Raw Haulage: ' + fmtUSD(rawRev))
        : ('Recorded ' + fmtUSD(salesRev + rawRev) + ' + ' + fmtUSD(adjRev) + ' Shadow/Missing Credit'),
      totalCost,
      costPerTrip: totalTrips > 0 ? (totalCost / totalTrips) : 0,
      costPerM3: totalVol > 0 ? (totalCost / totalVol) : 0,
      netProfit,
      marginPct,
      netPerTrip: totalTrips > 0 ? (netProfit / totalTrips) : 0,
      zeroTrips,
      recZeroTrips,
      zeroSub: totalTrips > 0
        ? (((recZeroTrips / totalTrips) * 100).toFixed(1) + '% of selected live trips at $0.00 (' + fmtInt(recZeroTrips) + ' trips)')
        : 'No trips in selected period/company scope',
      liveRoutes: Array.from(routeMap.values()).sort((a, b) => (b.zero_trips - a.zero_trips) || (b.trips - a.trips)),
      liveZeroGroups: Array.from(zeroGroupMap.values()).sort((a, b) => (b.est_missing - a.est_missing) || (b.zero_trips - a.zero_trips)),
      liveExpenses,
      liveOtList
    };
  }

  function getActiveModel() {
    normalizeSelectedTrucks();
    if (state.scope === 'live') {
      return computeLiveDataset();
    }
    return computeCutoverModel();
  }

  /* ==========================================================================
     Prominent Specific-Truck & Multi-Truck Filter Deck Renderer
     ========================================================================== */
  function renderTruckFilterBar(m) {
    const catalog = getMasterTruckCatalog();
    const cohortCodes = getCohortCodes(state.cohort === 'custom' ? 'bdeir' : state.cohort, catalog);
    const pillSet = new Set(cohortCodes);
    for (const sel of state.selectedTrucks) pillSet.add(sel);
    const catByCode = new Map(catalog.map(t => [t.code, t]));

    const pillItems = Array.from(pillSet)
      .map(c => catByCode.get(c) || { code: c, plate: c, owner: '', liveTrips: 0, cutoverTrips: 0 })
      .slice(0, 14);

    const isAllCohortSelected = cohortCodes.length > 0 &&
      cohortCodes.length === state.selectedTrucks.length &&
      cohortCodes.every(c => state.selectedTrucks.includes(c));

    const filteredPickerItems = searchTruckCatalog(catalog, state.pickerSearch);

    let pickerBtnLabel = 'Choose Specific Trucks (' + state.selectedTrucks.length + ' selected)';
    if (state.selectedTrucks.length === 1) {
      const only = catByCode.get(state.selectedTrucks[0]);
      pickerBtnLabel = 'Focused: ' + state.selectedTrucks[0] + (only && only.plate && only.plate !== state.selectedTrucks[0] ? ' · ' + only.plate : '');
    } else if (state.selectedTrucks.length <= 3) {
      pickerBtnLabel = 'Trucks: ' + state.selectedTrucks.join(' + ');
    }

    const activeSummary = state.selectedTrucks.length === 1
      ? ('Focused on 1 Truck: ' + state.selectedTrucks[0])
      : (isAllCohortSelected
        ? ('Showing All ' + state.selectedTrucks.length + ' Cohort Trucks')
        : ('Comparing ' + state.selectedTrucks.length + ' Selected Trucks'));

    const isDefaultState = state.cohort === 'bdeir' && isAllCohortSelected && state.coFilter === 'ALL';

    return `
      <div class="fpnl-truck-bar" id="fpnlTruckFilterBar" role="region" aria-label="Specific Truck &amp; Cohort Filter">
        <div class="fpnl-bar-row">
          <span class="fpnl-bar-lbl">Fleet Cohort:</span>
          <div class="fpnl-cohort-bar" role="group" aria-label="Fleet Presets">
            <button type="button" class="fpnl-cohort-btn ${state.cohort === 'bdeir' ? 'on' : ''}" data-fpnl-cohort="bdeir">Bdeir Fleet (3: TB1 · Tb7 · Tb9)</button>
            <button type="button" class="fpnl-cohort-btn ${state.cohort === 'wtc_own' ? 'on' : ''}" data-fpnl-cohort="wtc_own">WTC Own Trucks (4: TB8 · Tb4 · TB3 · Tb2)</button>
            <button type="button" class="fpnl-cohort-btn ${state.cohort === 'core7' ? 'on' : ''}" data-fpnl-cohort="core7">Core 7 Trucks</button>
            <button type="button" class="fpnl-cohort-btn ${state.cohort === 'family' ? 'on' : ''}" data-fpnl-cohort="family">Afif &amp; Ibrahim Bdeir</button>
            <button type="button" class="fpnl-cohort-btn ${state.cohort === 'all' ? 'on' : ''}" data-fpnl-cohort="all">Top Active Haulers</button>
          </div>

          <div class="fpnl-picker-wrap" id="fpnlTruckPickerWrap">
            <button type="button" class="fpnl-picker-btn ${state.pickerOpen ? 'open' : ''}" id="fpnlTruckPickerBtn" data-fpnl-picker-toggle="1" aria-expanded="${state.pickerOpen ? 'true' : 'false'}">
              <span>${esc(pickerBtnLabel)}</span>
              <span style="font-size:10px;opacity:0.75;">▼</span>
            </button>
            ${state.pickerOpen ? `
              <div class="fpnl-picker-menu" id="fpnlTruckPickerMenu">
                <div class="fpnl-picker-head">
                  <input type="search" class="fpnl-picker-search" id="fpnlPickerSearch" placeholder="Search truck code, plate #, owner, driver..." value="${esc(state.pickerSearch)}">
                  <div class="fpnl-picker-actions">
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                      <button type="button" class="fpnl-mini-btn" data-fpnl-picker-all="1">Select Shown (${Math.min(15, filteredPickerItems.length)})</button>
                      <button type="button" class="fpnl-mini-btn" data-fpnl-cohort="bdeir">Bdeir 3</button>
                      <button type="button" class="fpnl-mini-btn" data-fpnl-cohort="wtc_own">WTC 4</button>
                    </div>
                    <button type="button" class="fpnl-mini-btn" data-fpnl-picker-close="1">Done</button>
                  </div>
                </div>
                <div class="fpnl-picker-list">
                  ${filteredPickerItems.slice(0, 60).map(item => {
                    const checked = state.selectedTrucks.includes(item.code);
                    const tripCnt = state.scope === 'cutover' && item.isBdeir3 ? item.cutoverTrips : item.liveTrips;
                    const plateTxt = item.plate && item.plate !== item.code ? (' · ' + item.plate) : '';
                    const ownerTxt = item.owner ? (' · ' + item.owner) : '';
                    return `
                      <div class="fpnl-picker-item ${checked ? 'on' : ''}">
                        <label class="fpnl-picker-chk">
                          <input type="checkbox" data-fpnl-toggle-truck="${esc(item.code)}" ${checked ? 'checked' : ''}>
                          <span class="fpnl-picker-lbl"><strong>${esc(item.code)}</strong>${esc(plateTxt)}${esc(ownerTxt)}</span>
                        </label>
                        <div class="fpnl-picker-right">
                          <span class="fpnl-truck-chip-cnt">${fmtInt(tripCnt)} trips</span>
                          <button type="button" class="fpnl-only-btn" data-fpnl-only-truck="${esc(item.code)}" data-ui-tip="Focus only on ${esc(item.code)}">Only</button>
                        </div>
                      </div>
                    `;
                  }).join('') || '<div style="padding:12px;font-size:12px;color:var(--ink-soft);">No trucks match search</div>'}
                </div>
              </div>
            ` : ''}
          </div>

          <span class="fpnl-bar-lbl" style="margin-left:4px;">Company:</span>
          <div class="fpnl-co-bar" role="group" aria-label="Company Stream Filter">
            <button type="button" class="fpnl-co-btn ${state.coFilter === 'ALL' ? 'on' : ''}" data-fpnl-co="ALL">All Cos.</button>
            <button type="button" class="fpnl-co-btn ${state.coFilter === 'WTC' ? 'on' : ''}" data-fpnl-co="WTC">WTC</button>
            <button type="button" class="fpnl-co-btn ${state.coFilter === 'BBConstruction' ? 'on' : ''}" data-fpnl-co="BBConstruction">BBConstruction</button>
            ${state.scope === 'live' ? `<button type="button" class="fpnl-co-btn ${state.coFilter === 'Lions Transport' ? 'on' : ''}" data-fpnl-co="Lions Transport">Lions Transport</button>` : ''}
          </div>

          ${!isDefaultState ? `<button type="button" class="fpnl-reset-btn" data-fpnl-reset="1">Reset Filter</button>` : ''}
        </div>

        <div class="fpnl-bar-row" id="fpnlTruckPillsRow">
          <span class="fpnl-bar-lbl">Specific Truck:</span>
          <div class="fpnl-truck-pills">
            <button type="button" class="fpnl-truck-chip standalone ${isAllCohortSelected ? 'on' : ''}" data-fpnl-all-cohort="1">
              All Cohort (${cohortCodes.length})
            </button>
            ${pillItems.map(item => {
              const isSel = state.selectedTrucks.includes(item.code);
              const isSole = isSel && state.selectedTrucks.length === 1;
              const cnt = state.scope === 'cutover' && item.isBdeir3
                ? (m.trucks[item.code] ? m.trucks[item.code].trips : item.cutoverTrips)
                : item.liveTrips;
              const plateShort = item.plate && item.plate !== item.code ? (' · ' + item.plate) : '';
              return `
                <span class="fpnl-truck-chip-group ${isSel ? 'on' : ''}">
                  <button type="button" class="fpnl-truck-chip" data-fpnl-select-truck="${esc(item.code)}" data-ui-tip="${isSole ? 'Click to restore all cohort trucks' : 'Click to isolate ' + esc(item.code) + ' (or Ctrl+Click to compare multiple)'}">
                    <span>${esc(item.code)}${esc(plateShort)}</span>
                    <span class="fpnl-truck-chip-cnt">(${fmtInt(cnt)})</span>
                  </button>
                  <button type="button" class="fpnl-truck-chip-plus" data-fpnl-multi-truck="${esc(item.code)}" data-ui-tip="Toggle ${esc(item.code)} in multi-truck comparison" aria-label="Toggle ${esc(item.code)} comparison">${isSel ? '✓' : '+'}</button>
                </span>
              `;
            }).join('')}
          </div>
          <span class="fpnl-active-summary"><span class="fpnl-pill br">${esc(activeSummary)}</span></span>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     Sub-Tab 1: Executive P&L, Scorecards, Income Statement & Coverage Matrix
     ========================================================================== */
  function renderSubTabPnl(m) {
    const codes = m.codes;
    const trList = codes.map(c => m.trucks[c]).filter(Boolean);
    const totSalesTrips = trList.reduce((s, t) => s + t.salesTrips, 0);
    const totRawTrips = trList.reduce((s, t) => s + t.rawTrips, 0);
    const totSalesRev = trList.reduce((s, t) => s + t.salesRev, 0);
    const totRawRev = trList.reduce((s, t) => s + t.rawRev, 0);
    const totAdjRev = trList.reduce((s, t) => s + t.adjRev, 0);
    const totDieselL = trList.reduce((s, t) => s + t.dieselL, 0);
    const totDieselCost = trList.reduce((s, t) => s + t.dieselCost, 0);
    const totLubes = trList.reduce((s, t) => s + t.lubes, 0);
    const totRepairs = trList.reduce((s, t) => s + t.repairs, 0);
    const totIns = trList.reduce((s, t) => s + t.insurance, 0);
    const totDriver = trList.reduce((s, t) => s + t.driverPay, 0);
    const totOtTrips = trList.reduce((s, t) => s + (t.otTrips || 0), 0);

    const gridColsCls = trList.length === 1 ? 'cols-1' : (trList.length === 2 ? 'cols-2' : '');

    const truckCardsHtml = trList.map(tr => {
      const isSole = codes.length === 1 && codes[0] === tr.code;
      const plateMeta = tr.plate && tr.plate !== tr.code ? (' · Plate ' + tr.plate) : '';
      return `
        <div class="fpnl-truck-card">
          <div class="fpnl-truck-top">
            <div>
              <div class="fpnl-truck-name">${esc(tr.code)}${esc(plateMeta)} (${esc(tr.owner)})</div>
              <div class="fpnl-truck-meta">Driver: ${esc(tr.driver)}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
              <span class="fpnl-pill ${tr.statusClass}">Net ${fmtSignedUSD(tr.netProfit)} (${esc(tr.marginPct)})</span>
              <button type="button" class="fpnl-card-focus-btn ${isSole ? 'on' : ''}" data-fpnl-select-truck="${esc(tr.code)}">
                ${isSole ? 'Showing Only ' + esc(tr.code) + ' (Show All)' : 'Focus ' + esc(tr.code) + ' Only'}
              </button>
            </div>
          </div>
          <div class="fpnl-kv"><span>Total Trips (Paid / $0.00)</span><strong>${fmtInt(tr.trips)} (${fmtInt(tr.paidTrips)} paid / ${fmtInt(tr.zeroTrips)} $0)</strong></div>
          <div class="fpnl-kv"><span>Company Split (WTC / BBC)</span><strong>${fmtInt(tr.wtcTrips)} WTC / ${fmtInt(tr.bbcTrips)} BBC (${fmtNum(tr.vol, 1)} m³)</strong></div>
          <div class="fpnl-kv"><span>Sales Delivery Revenue (${fmtInt(tr.salesTrips)} trips)</span><strong>${fmtUSD(tr.salesRev)}</strong></div>
          <div class="fpnl-kv"><span>Raw Material Haulage (${fmtInt(tr.rawTrips)} trips)</span><strong>${fmtUSD(tr.rawRev)}</strong></div>
          ${tr.adjRev > 0 ? `<div class="fpnl-kv"><span>Unbundled / Missing-Rate Credit</span><strong style="color:#047857;">+${fmtUSD(tr.adjRev)}</strong></div>` : ''}
          <div class="fpnl-kv"><span><strong>Total Revenue</strong></span><strong>${fmtUSD(tr.totalRev)} (${fmtUSD(tr.trips ? tr.totalRev / tr.trips : 0)}/trip)</strong></div>
          <div class="fpnl-kv"><span>Diesel Fuel (${fmtInt(tr.dieselL)} L de-duplicated)</span><strong>-${fmtUSD(tr.dieselCost)}</strong></div>
          <div class="fpnl-kv"><span>Repairs, Parts, Insurance &amp; Lubes</span><strong>-${fmtUSD(tr.repairs + tr.lubes + tr.insurance)}</strong></div>
          <div class="fpnl-kv"><span>Driver Pay + Overtime (${fmtInt(tr.otTrips || 0)} OT)</span><strong>-${fmtUSD(tr.driverPay)}</strong></div>
          <div class="fpnl-kv"><span><strong>Total Operating Costs</strong></span><strong>-${fmtUSD(tr.totalCost)} (${fmtUSD(tr.trips ? tr.totalCost / tr.trips : 0)}/trip)</strong></div>
        </div>
      `;
    }).join('');

    /* Dynamic Multi-Column Income Statement (shows up to 8 selected truck columns + Selected Total) */
    const tableTrucks = trList.slice(0, 8);
    const showTotalCol = trList.length > 1;
    const colSpanCount = 1 + tableTrucks.length + (showTotalCol ? 1 : 0) + 1;
    const wtcPct = m.totalTrips > 0 ? ((m.wtcTrips / m.totalTrips) * 100).toFixed(1) : '0.0';
    const bbcPct = m.totalTrips > 0 ? ((m.bbcTrips / m.totalTrips) * 100).toFixed(1) : '0.0';
    const dieselSharePct = m.totalCost > 0 ? ((totDieselCost / m.totalCost) * 100).toFixed(1) : '0.0';

    /* Dynamic WTC vs BBConstruction Work Coverage Matrix for Selected Trucks */
    const sumField = (fn) => trList.reduce((s, t) => s + (Number(fn(t)) || 0), 0);
    const wtcS_trips = sumField(t => t.wtcSalesTrips), wtcS_paid = sumField(t => t.wtcSalesPaid), wtcS_zero = sumField(t => t.wtcSalesZero), wtcS_vol = sumField(t => t.wtcSalesVol), wtcS_rev = sumField(t => t.wtcSalesRev);
    const wtcR_trips = sumField(t => t.wtcRawTrips), wtcR_paid = sumField(t => t.wtcRawPaid), wtcR_zero = sumField(t => t.wtcRawZero), wtcR_vol = sumField(t => t.wtcRawVol), wtcR_rev = sumField(t => t.wtcRawRev);
    const bbcS_trips = sumField(t => t.bbcSalesTrips), bbcS_paid = sumField(t => t.bbcSalesPaid), bbcS_zero = sumField(t => t.bbcSalesZero), bbcS_vol = sumField(t => t.bbcSalesVol), bbcS_rev = sumField(t => t.bbcSalesRev);
    const bbcR_trips = sumField(t => t.bbcRawTrips), bbcR_paid = sumField(t => t.bbcRawPaid), bbcR_zero = sumField(t => t.bbcRawZero), bbcR_vol = sumField(t => t.bbcRawVol), bbcR_rev = sumField(t => t.bbcRawRev);

    const wtcS_est = m.isLive ? (wtcS_zero * 75) : CUTOVER_DATA.zero_haulage_groups.filter(z => codes.includes(z.truck) && z.co === 'WTC' && z.stream.startsWith('Sales')).reduce((s, z) => s + z.est_missing, 0);
    const wtcR_est = m.isLive ? (wtcR_zero * 60) : CUTOVER_DATA.zero_haulage_groups.filter(z => codes.includes(z.truck) && z.co === 'WTC' && !z.stream.startsWith('Sales')).reduce((s, z) => s + z.est_missing, 0);
    const bbcS_est = m.isLive ? (bbcS_zero * 116) : CUTOVER_DATA.zero_haulage_groups.filter(z => codes.includes(z.truck) && z.co === 'BBConstruction' && z.stream.startsWith('Sales')).reduce((s, z) => s + z.est_missing, 0);
    const bbcR_est = m.isLive ? (bbcR_zero * 69.92) : CUTOVER_DATA.zero_haulage_groups.filter(z => codes.includes(z.truck) && z.co === 'BBConstruction' && !z.stream.startsWith('Sales')).reduce((s, z) => s + z.est_missing, 0);

    return `
      <div class="fpnl-kpi-grid">
        <div class="fpnl-kpi-card">
          <div class="fpnl-kpi-lbl">Selected Trips (${codes.length} ${codes.length === 1 ? 'Truck' : 'Trucks'})</div>
          <div class="fpnl-kpi-val">${fmtInt(m.totalTrips)} Trips</div>
          <div class="fpnl-kpi-sub">${fmtInt(m.wtcTrips)} WTC (${wtcPct}%) · ${fmtInt(m.bbcTrips)} BBC (${bbcPct}%)</div>
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
          <div class="fpnl-kpi-sub">${fmtUSD(m.costPerTrip)}/trip · ${fmtUSD(m.costPerM3)}/m³ (${dieselSharePct}% Diesel)</div>
        </div>
        <div class="fpnl-kpi-card ${m.netProfit >= 0 ? 'em' : 'cr'}">
          <div class="fpnl-kpi-lbl">Selected Net Profit &amp; Margin</div>
          <div class="fpnl-kpi-val">${fmtSignedUSD(m.netProfit)}</div>
          <div class="fpnl-kpi-sub">Margin: ${esc(m.marginPct)} · ${fmtSignedUSD(m.netPerTrip)}/trip</div>
        </div>
        <div class="fpnl-kpi-card ${m.zeroTrips > 0 ? 'cr' : 'em'}">
          <div class="fpnl-kpi-lbl">Zero-Haulage ($0.00) Trips</div>
          <div class="fpnl-kpi-val">${fmtInt(m.zeroTrips)} / ${fmtInt(m.totalTrips)}</div>
          <div class="fpnl-kpi-sub">${esc(m.zeroSub)}</div>
        </div>
      </div>

      <div class="fpnl-truck-grid ${gridColsCls}">
        ${truckCardsHtml}
      </div>

      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Truck Income Statement (${esc(codes.join(' · '))}${state.coFilter !== 'ALL' ? ' | ' + esc(state.coFilter) : ' | WTC + BBConstruction'})</h4>
            <div class="fpnl-sec-sub">Click any truck chip above to isolate a single truck or click [+] to compare specific trucks side by side</div>
          </div>
          <span class="fpnl-pill br">${esc(m.label)}</span>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>P&amp;L Line Item</th>
                ${tableTrucks.map(t => `<th class="num">${esc(t.code)}${t.plate && t.plate !== t.code ? ' · ' + esc(t.plate) : ''} (${esc(t.owner)})</th>`).join('')}
                ${showTotalCol ? `<th class="num">Selected Total (${trList.length} Trucks)</th>` : ''}
                <th class="num">Per Trip / Share</th>
              </tr>
            </thead>
            <tbody>
              <tr class="fpnl-row-sec"><td colspan="${colSpanCount}">1. Operational Volume &amp; Trip Coverage</td></tr>
              <tr>
                <td>Total Trips Completed (Sales Deliveries + Raw Material Intake)</td>
                ${tableTrucks.map(t => `<td class="num">${fmtInt(t.trips)} (${fmtInt(t.salesTrips)} S / ${fmtInt(t.rawTrips)} R)</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>${fmtInt(m.totalTrips)} (${fmtInt(totSalesTrips)} S / ${fmtInt(totRawTrips)} R)</strong></td>` : ''}
                <td class="num">100.0%</td>
              </tr>
              <tr>
                <td>Paid Trips vs. Zero-Haulage ($0.00) Trips</td>
                ${tableTrucks.map(t => `<td class="num">${fmtInt(t.paidTrips)} paid / ${fmtInt(t.zeroTrips)} $0</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>${fmtInt(m.totalTrips - m.zeroTrips)} paid / ${fmtInt(m.zeroTrips)} $0</strong></td>` : ''}
                <td class="num">${m.totalTrips ? ((m.zeroTrips / m.totalTrips) * 100).toFixed(1) : '0.0'}% at $0</td>
              </tr>
              <tr>
                <td>Total Volume Transported (m³)</td>
                ${tableTrucks.map(t => `<td class="num">${fmtNum(t.vol, 1)} m³</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>${fmtNum(m.totalVol, 1)} m³</strong></td>` : ''}
                <td class="num">${fmtNum(m.totalTrips ? m.totalVol / m.totalTrips : 0, 2)} m³/trip</td>
              </tr>

              <tr class="fpnl-row-sec"><td colspan="${colSpanCount}">2. Recorded &amp; Adjusted Transportation Revenue</td></tr>
              <tr>
                <td>Customer Sales Delivery Transport Revenue</td>
                ${tableTrucks.map(t => `<td class="num">${fmtUSD(t.salesRev)}</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>${fmtUSD(totSalesRev)}</strong></td>` : ''}
                <td class="num">${fmtUSD(totSalesTrips ? totSalesRev / totSalesTrips : 0)}/sales trip</td>
              </tr>
              <tr>
                <td>Raw Material Inbound Haulage Revenue</td>
                ${tableTrucks.map(t => `<td class="num">${fmtUSD(t.rawRev)}</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>${fmtUSD(totRawRev)}</strong></td>` : ''}
                <td class="num">${fmtUSD(totRawTrips ? totRawRev / totRawTrips : 0)}/raw trip</td>
              </tr>
              ${totAdjRev > 0 ? `
              <tr class="fpnl-row-adj">
                <td><strong>+ Unbundled All-In Sales &amp; Missing Route Rate Recovery</strong></td>
                ${tableTrucks.map(t => `<td class="num">+${fmtUSD(t.adjRev)}</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>+${fmtUSD(totAdjRev)}</strong></td>` : ''}
                <td class="num">+${fmtUSD(m.totalTrips ? totAdjRev / m.totalTrips : 0)}/trip</td>
              </tr>` : ''}
              <tr class="fpnl-row-tot">
                <td>TOTAL TRANSPORTATION REVENUE</td>
                ${tableTrucks.map(t => `<td class="num">${fmtUSD(t.totalRev)}</td>`).join('')}
                ${showTotalCol ? `<td class="num">${fmtUSD(m.transRev)}</td>` : ''}
                <td class="num">${fmtUSD(m.totalTrips ? m.transRev / m.totalTrips : 0)}/trip</td>
              </tr>

              <tr class="fpnl-row-sec"><td colspan="${colSpanCount}">3. Direct Operating Costs${state.coFilter !== 'ALL' && !m.isLive ? ' (Allocated by Company Trip Share)' : ' (De-Duplicated Across Sister Plants)'}</td></tr>
              <tr>
                <td>Diesel Fuel Cost (${fmtInt(totDieselL)} L net de-duplicated)</td>
                ${tableTrucks.map(t => `<td class="num">${fmtUSD(t.dieselCost)} (${fmtInt(t.dieselL)} L)</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>${fmtUSD(totDieselCost)}</strong></td>` : ''}
                <td class="num">${fmtUSD(m.totalTrips ? totDieselCost / m.totalTrips : 0)}/trip</td>
              </tr>
              <tr>
                <td>Driver Base Salaries, Attendance &amp; Verified Overtime (${fmtInt(totOtTrips)} OT trips)</td>
                ${tableTrucks.map(t => `<td class="num">${fmtUSD(t.driverPay)}</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>${fmtUSD(totDriver)}</strong></td>` : ''}
                <td class="num">${fmtUSD(m.totalTrips ? totDriver / m.totalTrips : 0)}/trip</td>
              </tr>
              <tr>
                <td>Repairs, Spare Parts, Tires &amp; Workshop Maintenance</td>
                ${tableTrucks.map(t => `<td class="num">${fmtUSD(t.repairs)}</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>${fmtUSD(totRepairs)}</strong></td>` : ''}
                <td class="num">${fmtUSD(m.totalTrips ? totRepairs / m.totalTrips : 0)}/trip</td>
              </tr>
              <tr>
                <td>Motor Oil, Hydraulic Oil &amp; Lubricants</td>
                ${tableTrucks.map(t => `<td class="num">${fmtUSD(t.lubes)}</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>${fmtUSD(totLubes)}</strong></td>` : ''}
                <td class="num">${fmtUSD(m.totalTrips ? totLubes / m.totalTrips : 0)}/trip</td>
              </tr>
              <tr>
                <td>Truck Insurance (Prorated Policy Allocation)</td>
                ${tableTrucks.map(t => `<td class="num">${fmtUSD(t.insurance)}</td>`).join('')}
                ${showTotalCol ? `<td class="num"><strong>${fmtUSD(totIns)}</strong></td>` : ''}
                <td class="num">${fmtUSD(m.totalTrips ? totIns / m.totalTrips : 0)}/trip</td>
              </tr>
              <tr class="fpnl-row-tot">
                <td>TOTAL OPERATING COSTS</td>
                ${tableTrucks.map(t => `<td class="num">${fmtUSD(t.totalCost)}</td>`).join('')}
                ${showTotalCol ? `<td class="num">${fmtUSD(m.totalCost)}</td>` : ''}
                <td class="num">${fmtUSD(m.costPerTrip)}/trip</td>
              </tr>

              <tr class="fpnl-row-tot">
                <td>NET PROFIT / (LOSS) &amp; OPERATING MARGIN</td>
                ${tableTrucks.map(t => `<td class="num"><span class="fpnl-pill ${t.statusClass}">${fmtSignedUSD(t.netProfit)} (${esc(t.marginPct)})</span></td>`).join('')}
                ${showTotalCol ? `<td class="num"><span class="fpnl-pill ${m.netProfit >= 0 ? 'em' : 'cr'}">${fmtSignedUSD(m.netProfit)} (${esc(m.marginPct)})</span></td>` : ''}
                <td class="num">${fmtSignedUSD(m.netPerTrip)}/trip</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">WTC vs. BBConstruction Work Coverage Matrix (${fmtInt(m.totalTrips)} Trips for Selected ${codes.length === 1 ? 'Truck ' + esc(codes[0]) : codes.length + ' Trucks'})</h4>
            <div class="fpnl-sec-sub">Reconciles Paid vs. Zero-Haulage ($0.00) trips across sister plants for ${esc(codes.join(', '))}</div>
          </div>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Company &amp; Stream</th>
                ${tableTrucks.map(t => `<th class="num">${esc(t.code)}</th>`).join('')}
                <th class="num">Total Trips (Paid / $0)</th>
                <th class="num">Volume (m³)</th>
                <th class="num">Recorded Trans. Rev</th>
                <th class="num">Unbooked ($0) Value</th>
              </tr>
            </thead>
            <tbody>
              ${state.coFilter !== 'BBConstruction' ? `
              <tr>
                <td><strong>WTC · Customer Sales Deliveries</strong></td>
                ${tableTrucks.map(t => `<td class="num">${fmtInt(t.wtcSalesTrips)} (${fmtInt(t.wtcSalesPaid)} / ${fmtInt(t.wtcSalesZero)} $0)</td>`).join('')}
                <td class="num"><strong>${fmtInt(wtcS_trips)} (${fmtInt(wtcS_paid)} / ${fmtInt(wtcS_zero)} $0)</strong></td>
                <td class="num">${fmtNum(wtcS_vol, 1)} m³</td>
                <td class="num">${fmtUSD(wtcS_rev)}</td>
                <td class="num" style="color:#047857;">${wtcS_est > 0 ? '+' + fmtUSD(wtcS_est) : '$0.00'}</td>
              </tr>
              <tr>
                <td><strong>WTC · Raw Material Intake</strong></td>
                ${tableTrucks.map(t => `<td class="num">${fmtInt(t.wtcRawTrips)} (${fmtInt(t.wtcRawPaid)} / ${fmtInt(t.wtcRawZero)} $0)</td>`).join('')}
                <td class="num"><strong>${fmtInt(wtcR_trips)} (${fmtInt(wtcR_paid)} / ${fmtInt(wtcR_zero)} $0)</strong></td>
                <td class="num">${fmtNum(wtcR_vol, 1)} m³</td>
                <td class="num">${fmtUSD(wtcR_rev)}</td>
                <td class="num" style="color:#047857;">${wtcR_est > 0 ? '+' + fmtUSD(wtcR_est) : '$0.00'}</td>
              </tr>
              <tr class="fpnl-row-sec">
                <td>Subtotal WTC Operations (${wtcPct}% of Selected Trips)</td>
                ${tableTrucks.map(t => `<td class="num">${fmtInt(t.wtcSalesTrips + t.wtcRawTrips)} (${fmtInt(t.wtcSalesPaid + t.wtcRawPaid)} / ${fmtInt(t.wtcSalesZero + t.wtcRawZero)} $0)</td>`).join('')}
                <td class="num">${fmtInt(wtcS_trips + wtcR_trips)} (${fmtInt(wtcS_paid + wtcR_paid)} / ${fmtInt(wtcS_zero + wtcR_zero)} $0)</td>
                <td class="num">${fmtNum(wtcS_vol + wtcR_vol, 1)} m³</td>
                <td class="num">${fmtUSD(wtcS_rev + wtcR_rev)}</td>
                <td class="num">+${fmtUSD(wtcS_est + wtcR_est)}</td>
              </tr>` : ''}
              ${state.coFilter !== 'WTC' ? `
              <tr>
                <td><strong>BBConstruction · Customer Sales Deliveries</strong></td>
                ${tableTrucks.map(t => `<td class="num">${fmtInt(t.bbcSalesTrips)} (${fmtInt(t.bbcSalesPaid)} / ${fmtInt(t.bbcSalesZero)} $0)</td>`).join('')}
                <td class="num"><strong>${fmtInt(bbcS_trips)} (${fmtInt(bbcS_paid)} / ${fmtInt(bbcS_zero)} $0)</strong></td>
                <td class="num">${fmtNum(bbcS_vol, 1)} m³</td>
                <td class="num">${fmtUSD(bbcS_rev)}</td>
                <td class="num" style="color:#047857;">${bbcS_est > 0 ? '+' + fmtUSD(bbcS_est) : '$0.00'}</td>
              </tr>
              <tr>
                <td><strong>BBConstruction · Raw Material Intake</strong></td>
                ${tableTrucks.map(t => `<td class="num">${fmtInt(t.bbcRawTrips)} (${fmtInt(t.bbcRawPaid)} / ${fmtInt(t.bbcRawZero)} $0)</td>`).join('')}
                <td class="num"><strong>${fmtInt(bbcR_trips)} (${fmtInt(bbcR_paid)} / ${fmtInt(bbcR_zero)} $0)</strong></td>
                <td class="num">${fmtNum(bbcR_vol, 1)} m³</td>
                <td class="num">${fmtUSD(bbcR_rev)}</td>
                <td class="num" style="color:#047857;">${bbcR_est > 0 ? '+' + fmtUSD(bbcR_est) : '$0.00'}</td>
              </tr>
              <tr class="fpnl-row-sec">
                <td>Subtotal BBConstruction Operations (${bbcPct}% of Selected Trips)</td>
                ${tableTrucks.map(t => `<td class="num">${fmtInt(t.bbcSalesTrips + t.bbcRawTrips)} (${fmtInt(t.bbcSalesPaid + t.bbcRawPaid)} / ${fmtInt(t.bbcSalesZero + t.bbcRawZero)} $0)</td>`).join('')}
                <td class="num">${fmtInt(bbcS_trips + bbcR_trips)} (${fmtInt(bbcS_paid + bbcR_paid)} / ${fmtInt(bbcS_zero + bbcR_zero)} $0)</td>
                <td class="num">${fmtNum(bbcS_vol + bbcR_vol, 1)} m³</td>
                <td class="num">${fmtUSD(bbcS_rev + bbcR_rev)}</td>
                <td class="num">+${fmtUSD(bbcS_est + bbcR_est)}</td>
              </tr>` : ''}
            </tbody>
            <tfoot>
              <tr>
                <td>SELECTED FLEET TOTAL (${esc(codes.join(' + '))})</td>
                ${tableTrucks.map(t => `<td class="num">${fmtInt(t.trips)} (${fmtInt(t.recPaidTrips)} / ${fmtInt(t.recZeroTrips)} $0)</td>`).join('')}
                <td class="num">${fmtInt(m.totalTrips)} (${fmtInt(m.totalTrips - m.recZeroTrips)} / ${fmtInt(m.recZeroTrips)} $0)</td>
                <td class="num">${fmtNum(m.totalVol, 1)} m³</td>
                <td class="num">${fmtUSD(totSalesRev + totRawRev)}</td>
                <td class="num">+${fmtUSD(wtcS_est + wtcR_est + bbcS_est + bbcR_est)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     Sub-Tab 2: Zero-Haulage ($0.00) Audit (Filtered by Selected Trucks!)
     ========================================================================== */
  function getFilteredZeroRows(m) {
    const selectedSet = new Set(m.codes);
    const source = m.isLive ? m.liveZeroGroups : CUTOVER_DATA.zero_haulage_groups;
    const q = state.zeroSearch.trim().toLowerCase();
    return source.filter(z => {
      if (!selectedSet.has(z.truck)) return false;
      if (!m.isLive && !matchCoFilter(z.co)) return false;
      if (state.zeroStream !== 'ALL') {
        const isSales = String(z.stream || '').toLowerCase().startsWith('sales');
        if (state.zeroStream === 'Sales' && !isSales) return false;
        if (state.zeroStream === 'Raw' && isSales) return false;
      }
      if (q) {
        const hay = (z.co + ' ' + z.stream + ' ' + z.truck + ' ' + z.counterparty + ' ' + z.site + ' ' + z.product + ' ' + (z.all_invoices || '') + ' ' + (z.reason || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderSubTabZero(m) {
    const rows = getFilteredZeroRows(m);
    let sumTrips = 0, sumVol = 0, sumEst = 0;
    for (const z of rows) {
      sumTrips += (Number(z.zero_trips) || 0);
      sumVol += (Number(z.zero_vol) || 0);
      sumEst += (Number(z.est_missing) || 0);
    }

    const leakageSection = !m.isLive ? `
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Forensic Leakage Buckets &amp; Actionable Fixes (${esc(m.codes.join(' · '))})</h4>
            <div class="fpnl-sec-sub">Trip counts and recoverable value dynamically scoped to the selected truck(s)</div>
          </div>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Leakage Bucket</th>
                <th class="num">Selected Truck Trips</th>
                <th>Root Cause in Ledger</th>
                <th>Recommended Action</th>
                <th class="num">Selected Recoverable ($)</th>
              </tr>
            </thead>
            <tbody>
              ${LEAKAGE_BUCKETS.map(b => {
                const selTrips = m.codes.reduce((s, c) => s + (Number(b[c]) || 0), 0);
                const fullTrips = b.TB1 + b.Tb7 + b.Tb9;
                const selEst = b.est > 0 && fullTrips > 0 ? (m.codes.length === 3 ? b.est : (b.est * (selTrips / fullTrips))) : 0;
                const perTruckBreak = m.codes.map(c => c + ': ' + (b[c] || 0)).join(' · ');
                return `
                  <tr>
                    <td><strong>${esc(b.cat)}</strong></td>
                    <td class="num"><strong>${fmtInt(selTrips)} trips</strong><br><small style="color:var(--ink-soft)">${esc(perTruckBreak)}</small></td>
                    <td>${esc(b.why)}</td>
                    <td>${esc(b.action)}</td>
                    <td class="num"><span class="fpnl-pill ${b.pillClass}">${selEst > 0 ? '+' + fmtUSD(selEst) : 'Rate Review'}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : '';

    return `
      ${leakageSection}
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Zero-Haulage ($0.00) Route Schedule (${esc(m.codes.join(' · '))})</h4>
            <div class="fpnl-sec-sub">Every transportation or raw material haulage route booked at $0.00 for the selected truck(s)</div>
          </div>
          <span class="fpnl-pill am">${fmtInt(rows.length)} Route Groups · ${fmtInt(sumTrips)} $0 Trips · +${fmtUSD(sumEst)}</span>
        </div>
        <div class="fpnl-filter-bar">
          <input type="search" id="fpnlZeroSearch" placeholder="Search customer, supplier, site, product, bon/invoice #..." value="${esc(state.zeroSearch)}">
          <select id="fpnlZeroStream" data-freq-exempt="1">
            <option value="ALL" ${state.zeroStream === 'ALL' ? 'selected' : ''}>All Streams</option>
            <option value="Raw" ${state.zeroStream === 'Raw' ? 'selected' : ''}>Raw Material ($0)</option>
            <option value="Sales" ${state.zeroStream === 'Sales' ? 'selected' : ''}>Sales Delivery ($0)</option>
          </select>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Company &amp; Stream</th>
                <th>Truck</th>
                <th>Customer / Supplier &amp; Site</th>
                <th>Product</th>
                <th class="num">$0 Trips</th>
                <th class="num">Vol (m³)</th>
                <th>Date Window</th>
                <th class="num">Est. Unbooked ($)</th>
                <th>Root Cause &amp; Fair Rate Basis</th>
                <th>Bon / Invoice Numbers</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(z => `
                <tr>
                  <td><strong>${esc(z.co)}</strong><br><small style="color:var(--ink-soft)">${esc(z.stream.startsWith('Sales') ? 'Sales ($0)' : 'Raw ($0)')}</small></td>
                  <td><button type="button" class="fpnl-only-btn" data-fpnl-select-truck="${esc(z.truck)}" data-ui-tip="Focus ${esc(z.truck)}"><strong>${esc(z.truck)}</strong></button></td>
                  <td><strong>${esc(z.counterparty)}</strong><br><small style="color:var(--ink-soft)">${esc(z.site)}</small></td>
                  <td>${esc(z.product)}</td>
                  <td class="num"><strong>${fmtInt(z.zero_trips)}</strong> <small style="color:var(--ink-soft)">of ${fmtInt(z.total_route_trips)}</small></td>
                  <td class="num">${fmtNum(z.zero_vol, 1)}</td>
                  <td style="white-space:nowrap;font-size:11.5px;">${esc(z.dates)}</td>
                  <td class="num"><span class="fpnl-pill em">+${fmtUSD(z.est_missing)}</span></td>
                  <td>${esc(z.reason)}</td>
                  <td style="max-width:220px;font-size:11px;color:var(--ink-soft);word-break:break-word;">${esc(z.all_invoices || '-')}</td>
                </tr>
              `).join('') : '<tr><td colspan="10" style="text-align:center;padding:18px;color:var(--ink-soft);">No zero-haulage ($0.00) trips match the selected truck/company filter.</td></tr>'}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4">TOTAL FILTERED ZERO-HAULAGE ROUTES (${fmtInt(rows.length)} Groups)</td>
                <td class="num">${fmtInt(sumTrips)}</td>
                <td class="num">${fmtNum(sumVol, 1)} m³</td>
                <td></td>
                <td class="num">+${fmtUSD(sumEst)}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     Sub-Tab 3: All Routes Explorer (Filtered by Selected Trucks!)
     ========================================================================== */
  function getFilteredRouteRows(m) {
    const selectedSet = new Set(m.codes);
    let combined = [];
    if (m.isLive) {
      combined = m.liveRoutes;
    } else {
      CUTOVER_DATA.sales_sites.forEach(s => combined.push(Object.assign({}, s, { stream: 'Sales Delivery' })));
      CUTOVER_DATA.raw_sites.forEach(r => combined.push(Object.assign({}, r, { stream: 'Raw Material' })));
    }
    const q = state.routeSearch.trim().toLowerCase();
    const out = combined.filter(r => {
      if (!selectedSet.has(r.truck)) return false;
      if (!m.isLive && !matchCoFilter(r.co)) return false;
      if (state.routeStream !== 'ALL' && r.stream !== state.routeStream) return false;
      if (state.routePricing === 'PAID' && r.zero_trips > 0) return false;
      if (state.routePricing === 'ZERO' && !(r.zero_trips > 0)) return false;
      if (q) {
        const hay = ((r.site_label || '') + ' ' + (r.product || '') + ' ' + (r.status_full || '') + ' ' + (r.drivers || '') + ' ' + (r.co || '') + ' ' + (r.truck || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out.sort((a, b) => (b.zero_trips - a.zero_trips) || (b.trips - a.trips));
    return out;
  }

  function renderSubTabRoutes(m) {
    const rows = getFilteredRouteRows(m);
    let sTrips = 0, sPaid = 0, sZero = 0, sOt = 0, sVol = 0, sTrans = 0, sMiss = 0;
    for (const r of rows) {
      sTrips += (Number(r.trips) || 0);
      sPaid += (Number(r.paid_trips) || 0);
      sZero += (Number(r.zero_trips) || 0);
      sOt += (Number(r.ot_trips) || 0);
      sVol += (Number(r.vol) || 0);
      sTrans += (Number(r.trans_rev) || 0);
      sMiss += (Number(r.est_missing) || 0);
    }

    return `
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Routes &amp; Destinations Explorer (${esc(m.codes.join(' · '))})</h4>
            <div class="fpnl-sec-sub">Inspect trip counts, paid vs. $0.00 loads, volume, and booked haulage revenue per route for the selected truck(s)</div>
          </div>
          <span class="fpnl-pill br">${fmtInt(rows.length)} Routes · ${fmtInt(sTrips)} Trips · ${fmtUSD(sTrans)}</span>
        </div>
        <div class="fpnl-filter-bar">
          <input type="search" id="fpnlRouteSearch" placeholder="Search customer, supplier, quarry, delivery site, driver..." value="${esc(state.routeSearch)}">
          <select id="fpnlRouteStream" data-freq-exempt="1">
            <option value="ALL" ${state.routeStream === 'ALL' ? 'selected' : ''}>All Streams</option>
            <option value="Raw Material" ${state.routeStream === 'Raw Material' ? 'selected' : ''}>Raw Material Intake</option>
            <option value="Sales Delivery" ${state.routeStream === 'Sales Delivery' ? 'selected' : ''}>Sales Deliveries</option>
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
                <th>Truck</th>
                <th>Customer / Supplier &amp; Site</th>
                <th>Product</th>
                <th class="num">Trips</th>
                <th class="num">Paid / $0</th>
                <th class="num">OT</th>
                <th class="num">Volume (m³)</th>
                <th class="num">Booked Trans ($)</th>
                <th class="num">Avg / Trip</th>
                <th class="num">Unbooked Est ($)</th>
                <th>Pricing Notes &amp; Dates</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(r => {
                const perTrip = r.trips > 0 ? (r.trans_rev / r.trips) : 0;
                const statusNote = r.status_full
                  ? (r.status_full + ' (' + (r.first_dt || '') + ' to ' + (r.last_dt || '') + ')')
                  : ((r.zero_trips === 0 ? 'Paid route' : (r.paid_trips === 0 ? 'Zero haulage ($0)' : 'Mixed paid/$0')) + ' (' + (r.first_dt || '') + ' to ' + (r.last_dt || '') + ')');
                return `
                  <tr>
                    <td><strong>${esc(r.co)}</strong> · ${esc(r.stream.startsWith('Sales') ? 'Sales' : 'Raw')}</td>
                    <td><button type="button" class="fpnl-only-btn" data-fpnl-select-truck="${esc(r.truck)}"><strong>${esc(r.truck)}</strong></button></td>
                    <td><strong>${esc(r.site_label || r.site)}</strong>${r.drivers ? `<br><small style="color:var(--ink-soft)">${esc(r.drivers)}</small>` : ''}</td>
                    <td>${esc(r.product)}</td>
                    <td class="num"><strong>${fmtInt(r.trips)}</strong></td>
                    <td class="num">${fmtInt(r.paid_trips)} / <span style="${r.zero_trips > 0 ? 'color:#B91C1C;font-weight:800;' : ''}">${fmtInt(r.zero_trips)}</span></td>
                    <td class="num">${fmtInt(r.ot_trips || 0)}</td>
                    <td class="num">${fmtNum(r.vol, 1)}</td>
                    <td class="num"><strong>${fmtUSD(r.trans_rev)}</strong></td>
                    <td class="num">${fmtUSD(perTrip)}</td>
                    <td class="num">${r.est_missing > 0 ? `<span class="fpnl-pill am">+${fmtUSD(r.est_missing)}</span>` : '$0.00'}</td>
                    <td style="max-width:260px;font-size:11px;color:var(--ink-soft);">${esc(statusNote)}</td>
                  </tr>
                `;
              }).join('') : '<tr><td colspan="12" style="text-align:center;padding:18px;color:var(--ink-soft);">No routes match the selected truck/company filter.</td></tr>'}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4">TOTAL FILTERED ROUTES (${fmtInt(rows.length)} Route Groups)</td>
                <td class="num">${fmtInt(sTrips)}</td>
                <td class="num">${fmtInt(sPaid)} / ${fmtInt(sZero)}</td>
                <td class="num">${fmtInt(sOt)}</td>
                <td class="num">${fmtNum(sVol, 1)} m³</td>
                <td class="num">${fmtUSD(sTrans)}</td>
                <td class="num">${sTrips > 0 ? fmtUSD(sTrans / sTrips) : '$0.00'}</td>
                <td class="num">+${fmtUSD(sMiss)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     Sub-Tab 4: Diesel De-Dup & Repairs Ledger (Filtered by Selected Trucks!)
     ========================================================================== */
  function getFilteredExpenseRows(m) {
    const selectedSet = new Set(m.codes);
    const source = m.isLive ? m.liveExpenses : CUTOVER_DATA.truck_expenses;
    const q = state.expSearch.trim().toLowerCase();
    return source.filter(e => {
      if (!selectedSet.has(e.truck)) return false;
      if (!m.isLive && state.coFilter === 'BBConstruction' && e.co !== 'BBConstruction' && e.co !== 'WTC') return false;
      if (state.expPeriod === 'POST' && !e.is_post) return false;
      if (state.expPeriod === 'PRE' && e.is_post) return false;
      if (state.expCat !== 'ALL') {
        const isFuel = String(e.cat || '').toLowerCase().includes('fuel');
        if (state.expCat === 'FUEL' && !isFuel) return false;
        if (state.expCat === 'NONFUEL' && isFuel) return false;
        if (state.expCat !== 'FUEL' && state.expCat !== 'NONFUEL' && e.cat !== state.expCat) return false;
      }
      if (q) {
        const hay = ((e.date || '') + ' ' + (e.truck || '') + ' ' + (e.cat || '') + ' ' + (e.sub || '') + ' ' + (e.supplier || '') + ' ' + (e.notes || '') + ' ' + (e.inv || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderSubTabExpenses(m) {
    const rows = getFilteredExpenseRows(m);
    let sumAmt = 0;
    for (const r of rows) sumAmt += (Number(r.total != null ? r.total : r.usd) || 0);

    const bdeirSel = m.codes.filter(c => CUTOVER_TRUCK_BASE[c]).map(c => CUTOVER_TRUCK_BASE[c]);
    let wtcL = 0, wtcF = 0, bbcL = 0, bbcF = 0, dupL = 0, dupF = 0, netL = 0, billsUsd = 0, tankUsd = 0, uniqBbc = 0, totDieselUsd = 0, totTrips = 0;
    for (const b of bdeirSel) {
      wtcL += b.wtcLoggedL; wtcF += b.wtcFills;
      bbcL += b.bbcLoggedL; bbcF += b.bbcFills;
      dupL += b.dupL; dupF += b.dupFills;
      netL += b.dieselL; billsUsd += b.dieselBillsUsd;
      tankUsd += b.dieselTankUsd; uniqBbc += b.uniqueBbcUsd;
      totDieselUsd += b.dieselCost; totTrips += b.trips;
    }

    const dieselDedupHtml = !m.isLive && bdeirSel.length > 0 ? `
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Cross-Company Diesel De-Duplication &amp; Valuation (${esc(m.codes.join(' · '))})</h4>
            <div class="fpnl-sec-sub">Eliminates duplicated Sep 24 - Oct 22 fills logged simultaneously in both WTC and BBConstruction</div>
          </div>
          <span class="fpnl-pill em">${fmtInt(dupL)} L Duplicates Removed</span>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Truck &amp; Plate</th>
                <th class="num">WTC Logged L</th>
                <th class="num">BBC Logged L</th>
                <th class="num">Less Duplicated L</th>
                <th class="num">Net True Diesel (L)</th>
                <th class="num">Direct Supplier Bills ($)</th>
                <th class="num">WTC Bulk Tank ($)</th>
                <th class="num">Unique BBC Fill ($)</th>
                <th class="num">Total True Diesel Cost</th>
              </tr>
            </thead>
            <tbody>
              ${bdeirSel.map(b => `
                <tr>
                  <td><strong>${esc(b.code)} · Plate ${esc(b.plate)}</strong> (${esc(b.owner)})</td>
                  <td class="num">${fmtInt(b.wtcLoggedL)} L (${b.wtcFills})</td>
                  <td class="num">${fmtInt(b.bbcLoggedL)} L (${b.bbcFills})</td>
                  <td class="num" style="color:#B91C1C;">-${fmtInt(b.dupL)} L (${b.dupFills} dup)</td>
                  <td class="num"><strong>${fmtInt(b.dieselL)} L</strong></td>
                  <td class="num">${fmtUSD(b.dieselBillsUsd)}</td>
                  <td class="num">${fmtUSD(b.dieselTankUsd)}</td>
                  <td class="num">${fmtUSD(b.uniqueBbcUsd)}</td>
                  <td class="num"><strong>${fmtUSD(b.dieselCost)}</strong> (${fmtUSD(b.dieselCost / b.trips)}/trip)</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td>SELECTED TOTAL (${bdeirSel.length} ${bdeirSel.length === 1 ? 'TRUCK' : 'TRUCKS'})</td>
                <td class="num">${fmtInt(wtcL)} L (${wtcF})</td>
                <td class="num">${fmtInt(bbcL)} L (${bbcF})</td>
                <td class="num">-${fmtInt(dupL)} L (${dupF} dup)</td>
                <td class="num">${fmtInt(netL)} L</td>
                <td class="num">${fmtUSD(billsUsd)}</td>
                <td class="num">${fmtUSD(tankUsd)}</td>
                <td class="num">${fmtUSD(uniqBbc)}</td>
                <td class="num">${fmtUSD(totDieselUsd)} (${fmtUSD(totTrips ? totDieselUsd / totTrips : 0)}/trip)</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    ` : '';

    return `
      ${dieselDedupHtml}
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Itemized Truck Expense, Repair, Parts, Insurance &amp; Direct Fuel Ledger (${esc(m.codes.join(' · '))})</h4>
            <div class="fpnl-sec-sub">Direct supplier invoices, maintenance jobs, lubricants, and fuel vouchers for the selected truck(s)</div>
          </div>
          <span class="fpnl-pill br">${fmtInt(rows.length)} Entries · ${fmtUSD(sumAmt)}</span>
        </div>
        <div class="fpnl-filter-bar">
          <input type="search" id="fpnlExpSearch" placeholder="Search supplier, part/repair notes, invoice #, subcategory..." value="${esc(state.expSearch)}">
          <select id="fpnlExpPeriod" data-freq-exempt="1">
            <option value="ALL" ${state.expPeriod === 'ALL' ? 'selected' : ''}>All Dates</option>
            <option value="POST" ${state.expPeriod === 'POST' ? 'selected' : ''}>Post-Aug 24 Cutover Only</option>
            <option value="PRE" ${state.expPeriod === 'PRE' ? 'selected' : ''}>Pre-Cutover Only</option>
          </select>
          <select id="fpnlExpCat" data-freq-exempt="1">
            <option value="ALL" ${state.expCat === 'ALL' ? 'selected' : ''}>All Expense Categories</option>
            <option value="NONFUEL" ${state.expCat === 'NONFUEL' ? 'selected' : ''}>Repairs, Parts &amp; Insurance (Non-Fuel)</option>
            <option value="Repairs & Maintenance" ${state.expCat === 'Repairs & Maintenance' ? 'selected' : ''}>Repairs &amp; Maintenance</option>
            <option value="FUEL" ${state.expCat === 'FUEL' ? 'selected' : ''}>Fuel &amp; Diesel</option>
            <option value="Parts" ${state.expCat === 'Parts' ? 'selected' : ''}>Spare Parts</option>
            <option value="Insurance - Auto/Property" ${state.expCat === 'Insurance - Auto/Property' ? 'selected' : ''}>Insurance Policy</option>
          </select>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Period</th>
                <th>Truck</th>
                <th>Co.</th>
                <th>Invoice #</th>
                <th>Category &amp; Sub-Type</th>
                <th>Supplier / Source</th>
                <th class="num">Qty</th>
                <th class="num">Unit ($)</th>
                <th class="num">Total ($)</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(e => {
                const tot = Number(e.total != null ? e.total : e.usd) || 0;
                const ucost = Number(e.unit_cost != null ? e.unit_cost : e.price) || 0;
                return `
                  <tr>
                    <td style="white-space:nowrap;">${esc(e.date)}</td>
                    <td><span class="fpnl-pill ${e.is_post ? 'em' : 'sl'}">${e.is_post ? 'Post-Aug 24' : 'Pre-Cutover'}</span></td>
                    <td><button type="button" class="fpnl-only-btn" data-fpnl-select-truck="${esc(e.truck)}"><strong>${esc(e.truck)}</strong></button></td>
                    <td>${esc(e.co)}</td>
                    <td>${esc(e.inv || '-')}</td>
                    <td><strong>${esc(e.cat)}</strong><br><small style="color:var(--ink-soft)">${esc(e.sub || e.subcat || '')}</small></td>
                    <td>${esc(e.supplier)}</td>
                    <td class="num">${fmtNum(e.qty, 1)}</td>
                    <td class="num">${fmtUSD(ucost)}</td>
                    <td class="num"><strong>${fmtUSD(tot)}</strong></td>
                    <td style="max-width:220px;font-size:11px;color:var(--ink-soft);">${esc(e.notes || '-')}</td>
                  </tr>
                `;
              }).join('') : '<tr><td colspan="11" style="text-align:center;padding:18px;color:var(--ink-soft);">No expense entries match the selected truck/category filter.</td></tr>'}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="9">TOTAL FILTERED VOUCHER ENTRIES (${fmtInt(rows.length)} Bills)</td>
                <td class="num">${fmtUSD(sumAmt)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     Sub-Tab 5: Overtime, Payroll & Benchmarks (Filtered by Selected Trucks!)
     ========================================================================== */
  function getFilteredOtRows(m) {
    const selectedSet = new Set(m.codes);
    const source = m.isLive ? m.liveOtList : CUTOVER_DATA.ot_list;
    const q = state.otSearch.trim().toLowerCase();
    return source.filter(o => {
      if (!selectedSet.has(o.truck)) return false;
      if (!m.isLive && !matchCoFilter(o.co)) return false;
      if (state.otStream !== 'ALL' && !String(o.stream || '').startsWith(state.otStream)) return false;
      if (state.otDriver !== 'ALL' && !String(o.driver || '').toLowerCase().includes(state.otDriver.toLowerCase())) return false;
      if (q) {
        const hay = ((o.date || '') + ' ' + (o.truck || '') + ' ' + (o.driver || '') + ' ' + (o.co || '') + ' ' + (o.stream || '') + ' ' + (o.counterparty || '') + ' ' + (o.site || '') + ' ' + (o.product || '') + ' ' + (o.inv || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderSubTabOvertime(m) {
    const rows = getFilteredOtRows(m);
    let sumPay = 0, sumTrans = 0, sumVol = 0;
    for (const r of rows) {
      sumPay += (Number(r.ot_allow) || 0);
      sumTrans += (Number(r.trans_rev) || 0);
      sumVol += (Number(r.vol) || 0);
    }

    const trList = m.codes.map(c => m.trucks[c]).filter(Boolean).slice(0, 8);
    const payrollFiltered = DRIVER_PAYROLL_ROWS.filter(p => m.codes.includes(p.truck));

    /* Collect unique drivers in active OT source Ranked by Frequency (7z-freq) */
    const drvCounts = new Map();
    const rawOtSource = (m.isLive ? m.liveOtList : CUTOVER_DATA.ot_list).filter(o => m.codes.includes(o.truck));
    for (const o of rawOtSource) {
      const d = String(o.driver || '').trim();
      if (d) drvCounts.set(d, (drvCounts.get(d) || 0) + 1);
    }
    const sortedDrivers = Array.from(drvCounts.entries()).sort((a, b) => b[1] - a[1]);

    const payrollHtml = !m.isLive && payrollFiltered.length > 0 ? `
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Driver Payroll, Attendance Overtime &amp; Trip Overtime (${esc(m.codes.join(' · '))})</h4>
            <div class="fpnl-sec-sub">2-month driver compensation schedule for the selected truck(s)</div>
          </div>
          <span class="fpnl-pill em">${fmtInt(payrollFiltered.reduce((s, r) => s + r.otTrips, 0))} OT Trips = ${fmtUSD(payrollFiltered.reduce((s, r) => s + r.otPay, 0))}</span>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Driver &amp; Assigned Truck</th>
                <th>Active Period &amp; Days Worked</th>
                <th class="num">Base Salary ($)</th>
                <th class="num">Attendance OT ($)</th>
                <th class="num">Verified Trip OT ($)</th>
                <th class="num">Total Driver Pay ($)</th>
                <th>Audit Status</th>
              </tr>
            </thead>
            <tbody>
              ${payrollFiltered.map(p => `
                <tr>
                  <td><strong>${esc(p.driver)}</strong> · ${esc(p.truck)} (${esc(p.plate)})</td>
                  <td>${esc(p.period)}</td>
                  <td class="num">${fmtUSD(p.base)}</td>
                  <td class="num">${fmtUSD(p.attOt)}</td>
                  <td class="num">${fmtInt(p.otTrips)} trips (${fmtUSD(p.otPay)})</td>
                  <td class="num"><strong>${fmtUSD(p.recorded)}</strong></td>
                  <td><span class="fpnl-pill em">${esc(p.note)}</span></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">SELECTED DRIVER COMPENSATION (${payrollFiltered.length} ${payrollFiltered.length === 1 ? 'DRIVER' : 'DRIVERS'})</td>
                <td class="num">${fmtUSD(payrollFiltered.reduce((s, r) => s + r.base, 0))}</td>
                <td class="num">${fmtUSD(payrollFiltered.reduce((s, r) => s + r.attOt, 0))}</td>
                <td class="num">${fmtInt(payrollFiltered.reduce((s, r) => s + r.otTrips, 0))} trips (${fmtUSD(payrollFiltered.reduce((s, r) => s + r.otPay, 0))})</td>
                <td class="num">${fmtUSD(payrollFiltered.reduce((s, r) => s + r.recorded, 0))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    ` : '';

    return `
      ${payrollHtml}
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Truck &amp; Driver Operational Benchmarks (${esc(trList.map(t => t.code).join(' vs. '))})</h4>
            <div class="fpnl-sec-sub">7 unit-economics ratios across the selected truck(s)</div>
          </div>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Operational Benchmark Metric</th>
                ${trList.map(t => `<th class="num">${esc(t.code)}${t.plate && t.plate !== t.code ? ' · ' + esc(t.plate) : ''}</th>`).join('')}
                ${trList.length > 1 ? '<th class="num">Selected Average / Total</th>' : ''}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1. Daily Trip Velocity (Trips / Active Day)</td>
                ${trList.map(t => `<td class="num"><strong>${fmtNum(t.activeDays ? t.trips / t.activeDays : 0, 2)} trips/d</strong> (${fmtInt(t.trips)} / ${fmtInt(t.activeDays || 0)}d)</td>`).join('')}
                ${trList.length > 1 ? `<td class="num">${fmtNum(trList.reduce((s, t) => s + (t.activeDays ? t.trips / t.activeDays : 0), 0) / trList.length, 2)} trips/truck/d</td>` : ''}
              </tr>
              <tr>
                <td>2. Average Payload per Trip (m³ / trip)</td>
                ${trList.map(t => `<td class="num">${fmtNum(t.trips ? t.vol / t.trips : 0, 2)} m³/trip</td>`).join('')}
                ${trList.length > 1 ? `<td class="num">${fmtNum(m.totalTrips ? m.totalVol / m.totalTrips : 0, 2)} m³/trip</td>` : ''}
              </tr>
              <tr>
                <td>3. Diesel Burn Efficiency (L / trip &amp; L / m³)</td>
                ${trList.map(t => `<td class="num">${fmtNum(t.trips ? t.dieselL / t.trips : 0, 2)} L/trip (${fmtNum(t.vol ? t.dieselL / t.vol : 0, 2)} L/m³)</td>`).join('')}
                ${trList.length > 1 ? `<td class="num">${fmtNum(m.totalTrips ? trList.reduce((s, t) => s + t.dieselL, 0) / m.totalTrips : 0, 2)} L/trip</td>` : ''}
              </tr>
              <tr>
                <td>4. Zero-Haulage ($0.00) Exposure (% Unpaid)</td>
                ${trList.map(t => `<td class="num">${t.trips ? ((t.recZeroTrips / t.trips) * 100).toFixed(1) : '0.0'}% (${fmtInt(t.recZeroTrips)} of ${fmtInt(t.trips)})</td>`).join('')}
                ${trList.length > 1 ? `<td class="num">${m.totalTrips ? ((m.recZeroTrips / m.totalTrips) * 100).toFixed(1) : '0.0'}% (${fmtInt(m.recZeroTrips)} of ${fmtInt(m.totalTrips)})</td>` : ''}
              </tr>
              <tr>
                <td>5. Repairs, Parts &amp; Lubes per Trip ($ / trip)</td>
                ${trList.map(t => `<td class="num">${fmtUSD(t.trips ? (t.repairs + t.lubes) / t.trips : 0)}/trip (${fmtUSD(t.repairs + t.lubes, 0)})</td>`).join('')}
                ${trList.length > 1 ? `<td class="num">${fmtUSD(m.totalTrips ? trList.reduce((s, t) => s + t.repairs + t.lubes, 0) / m.totalTrips : 0)}/trip</td>` : ''}
              </tr>
              <tr>
                <td>6. Driver Compensation Cost per Trip ($ / trip)</td>
                ${trList.map(t => `<td class="num">${fmtUSD(t.trips ? t.driverPay / t.trips : 0)}/trip (${fmtUSD(t.driverPay, 0)})</td>`).join('')}
                ${trList.length > 1 ? `<td class="num">${fmtUSD(m.totalTrips ? trList.reduce((s, t) => s + t.driverPay, 0) / m.totalTrips : 0)}/trip</td>` : ''}
              </tr>
              <tr>
                <td>7. Net Profit per Trip (Active Valuation Mode)</td>
                ${trList.map(t => `<td class="num"><strong>${fmtSignedUSD(t.trips ? t.netProfit / t.trips : 0)}/trip</strong></td>`).join('')}
                ${trList.length > 1 ? `<td class="num"><strong>${fmtSignedUSD(m.netPerTrip)}/trip</strong></td>` : ''}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Chronological Overtime Trip Log (${esc(m.codes.join(' · '))})</h4>
            <div class="fpnl-sec-sub">Every overtime trip dispatched on the selected truck(s)</div>
          </div>
          <span class="fpnl-pill br">${fmtInt(rows.length)} OT Trips · ${fmtUSD(sumPay)} Driver OT · ${fmtUSD(sumTrans)} Trans Rev</span>
        </div>
        <div class="fpnl-filter-bar">
          <input type="search" id="fpnlOtSearch" placeholder="Search date, driver, customer/supplier, site, product, bon #..." value="${esc(state.otSearch)}">
          <select id="fpnlOtStream" data-freq-exempt="1">
            <option value="ALL" ${state.otStream === 'ALL' ? 'selected' : ''}>All Streams</option>
            <option value="Sales" ${state.otStream === 'Sales' ? 'selected' : ''}>Sales Deliveries</option>
            <option value="Raw" ${state.otStream === 'Raw' ? 'selected' : ''}>Raw Material Intake</option>
          </select>
          <select id="fpnlOtDriver" data-freq-exempt="1">
            <option value="ALL" ${state.otDriver === 'ALL' ? 'selected' : ''}>All Drivers (${fmtInt(rawOtSource.length)})</option>
            ${sortedDrivers.map(([drv, cnt]) => `<option value="${esc(drv)}" ${state.otDriver === drv ? 'selected' : ''}>${esc(drv)} (${fmtInt(cnt)})</option>`).join('')}
          </select>
        </div>
        <div class="fpnl-tbl-wrap">
          <table class="fpnl-tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Truck &amp; Driver</th>
                <th>Company &amp; Stream</th>
                <th>Site / Destination</th>
                <th>Product</th>
                <th>Bon / Inv #</th>
                <th class="num">Vol (m³)</th>
                <th class="num">Trip Trans Rev ($)</th>
                <th class="num">OT Allowance ($)</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(o => `
                <tr>
                  <td style="white-space:nowrap;">${esc(o.date)}</td>
                  <td><button type="button" class="fpnl-only-btn" data-fpnl-select-truck="${esc(o.truck)}"><strong>${esc(o.truck)}</strong></button> · ${esc(o.driver)}</td>
                  <td><strong>${esc(o.co)}</strong> · ${esc(o.stream)}</td>
                  <td><strong>${esc(o.site)}</strong></td>
                  <td>${esc(o.product)}</td>
                  <td>${esc(o.inv)}</td>
                  <td class="num">${fmtNum(o.vol, 1)}</td>
                  <td class="num">${fmtUSD(o.trans_rev)}</td>
                  <td class="num"><strong>${fmtUSD(o.ot_allow)}</strong></td>
                </tr>
              `).join('') : '<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--ink-soft);">No overtime trips match the selected truck/driver filter.</td></tr>'}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="6">TOTAL FILTERED OVERTIME TRIPS (${fmtInt(rows.length)} Trips)</td>
                <td class="num">${fmtNum(sumVol, 1)} m³</td>
                <td class="num">${fmtUSD(sumTrans)}</td>
                <td class="num">${fmtUSD(sumPay)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderSubTabRecon(m) {
    const findings = RECON_FINDINGS.filter(f => m.isLive || f.trucks.some(t => m.codes.includes(t)));
    return `
      <div class="fpnl-section">
        <div class="fpnl-sec-head">
          <div>
            <h4 class="fpnl-sec-title">Cross-Ledger Reconciliation Audit (${esc(m.codes.join(' · '))})</h4>
            <div class="fpnl-sec-sub">Critical data-integrity rules permanently enforced so individual truck profitability is never distorted</div>
          </div>
          <span class="fpnl-pill em">100% Reconciled</span>
        </div>
        <div class="fpnl-body">
          <div class="fpnl-callout-grid">
            ${findings.map(f => `
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

  /* ==========================================================================
     Main Cockpit Shell Renderer
     ========================================================================== */
  function renderCockpitHtml(opts = {}) {
    if (opts && typeof opts.slicerEquipment === 'string' && opts.slicerEquipment !== _lastSlicerEq) {
      _lastSlicerEq = opts.slicerEquipment;
      if (opts.slicerEquipment.trim()) {
        const c = canonTruckCode(opts.slicerEquipment);
        if (c) {
          state.cohort = 'custom';
          state.selectedTrucks = [c];
        }
      } else if (state.cohort === 'custom') {
        state.cohort = 'bdeir';
        state.selectedTrucks = BDEIR_CODES.slice();
      }
    }

    const m = getActiveModel();
    const zeroRowsCount = getFilteredZeroRows(m);
    const zeroTripBadge = zeroRowsCount.reduce((s, r) => s + (Number(r.zero_trips) || 0), 0);
    const routeCount = getFilteredRouteRows(m).length;
    const expCount = getFilteredExpenseRows(m).length;
    const otCount = getFilteredOtRows(m).length;

    let bodyHtml = '';
    if (state.tab === 'pnl') bodyHtml = renderSubTabPnl(m);
    else if (state.tab === 'zero') bodyHtml = renderSubTabZero(m);
    else if (state.tab === 'routes') bodyHtml = renderSubTabRoutes(m);
    else if (state.tab === 'expenses') bodyHtml = renderSubTabExpenses(m);
    else if (state.tab === 'overtime') bodyHtml = renderSubTabOvertime(m);
    else if (state.tab === 'recon') bodyHtml = renderSubTabRecon(m);

    const cid = opts.containerId || 'fleetRevCostCockpit';
    const titleScopeTxt = m.codes.length === 1
      ? ('Focused: ' + m.codes[0] + (m.trucks[m.codes[0]] && m.trucks[m.codes[0]].plate !== m.codes[0] ? ' · Plate ' + m.trucks[m.codes[0]].plate : ''))
      : (m.codes.length <= 4 ? m.codes.join(' | ') : (m.codes.length + ' Selected Trucks'));

    return `
      <section class="fpnl-cockpit" id="${esc(cid)}" data-fpnl-cockpit="1">
        <div class="fpnl-head">
          <div class="fpnl-head-left">
            <div class="fpnl-eyebrow">
              <span>TRUCK FLEET REVENUE &amp; COST AUDIT · SPECIFIC-TRUCK &amp; COHORT PROFITABILITY</span>
            </div>
            <h3 class="fpnl-title">Truck Fleet Revenue &amp; Cost Analysis (${esc(titleScopeTxt)})</h3>
            <p class="fpnl-sub">Filter down to any single truck, compare specific trucks side by side, or switch between the audited Aug 24 - Oct 23, 2026 Bdeir Fleet cutover (999 Trips · 28,440.2 m³) and Live Dynamic Fleet records across all trucks.</p>
          </div>
          <div class="fpnl-controls">
            <div class="fpnl-scope-bar" role="group" aria-label="Analysis Scope">
              <button type="button" class="fpnl-scope-btn ${state.scope === 'cutover' ? 'on' : ''}" data-fpnl-scope="cutover">Aug 24 - Oct 23, 2026 Cutover Audit</button>
              <button type="button" class="fpnl-scope-btn ${state.scope === 'live' ? 'on' : ''}" data-fpnl-scope="live">Live Active Slicer (All Trucks)</button>
            </div>
            <div class="fpnl-mode-bar" role="group" aria-label="P&L Valuation Mode">
              <button type="button" class="fpnl-mode-btn ${state.mode === 'recorded' ? 'on' : ''}" data-fpnl-mode="recorded">1. Recorded Ledger P&amp;L</button>
              <button type="button" class="fpnl-mode-btn ${state.mode === 'strict' ? 'on' : ''}" data-fpnl-mode="strict">2. Strict Adjusted P&amp;L</button>
              <button type="button" class="fpnl-mode-btn ${state.mode === 'full' ? 'on' : ''}" data-fpnl-mode="full">3. Full Benchmark P&amp;L</button>
            </div>
          </div>
        </div>

        ${renderTruckFilterBar(m)}

        <div class="fpnl-subtabs" role="tablist" aria-label="Fleet Analysis Views">
          <button type="button" class="fpnl-subtab ${state.tab === 'pnl' ? 'on' : ''}" data-fpnl-tab="pnl">
            <span>1. Executive P&amp;L &amp; Scorecards</span>
            <span class="fpnl-subtab-badge">${m.codes.length} ${m.codes.length === 1 ? 'Truck' : 'Trucks'}</span>
          </button>
          <button type="button" class="fpnl-subtab ${state.tab === 'zero' ? 'on' : ''}" data-fpnl-tab="zero">
            <span>2. Zero-Haulage ($0.00) Audit</span>
            <span class="fpnl-subtab-badge">${fmtInt(zeroTripBadge)} Trips</span>
          </button>
          <button type="button" class="fpnl-subtab ${state.tab === 'routes' ? 'on' : ''}" data-fpnl-tab="routes">
            <span>3. Routes Explorer</span>
            <span class="fpnl-subtab-badge">${fmtInt(routeCount)} Routes</span>
          </button>
          <button type="button" class="fpnl-subtab ${state.tab === 'expenses' ? 'on' : ''}" data-fpnl-tab="expenses">
            <span>4. Diesel De-Dup &amp; Repairs</span>
            <span class="fpnl-subtab-badge">${fmtInt(expCount)} Bills</span>
          </button>
          <button type="button" class="fpnl-subtab ${state.tab === 'overtime' ? 'on' : ''}" data-fpnl-tab="overtime">
            <span>5. Overtime, Payroll &amp; Benchmarks</span>
            <span class="fpnl-subtab-badge">${fmtInt(otCount)} OT</span>
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

  function refreshAllCockpits() {
    const activeId = document.activeElement ? document.activeElement.id : null;
    const selStart = document.activeElement && typeof document.activeElement.selectionStart === 'number' ? document.activeElement.selectionStart : null;
    document.querySelectorAll('[data-fpnl-cockpit="1"]').forEach(target => {
      const cid = target.id || 'fleetRevCostCockpit';
      target.outerHTML = renderCockpitHtml({ containerId: cid });
    });
    if (activeId) {
      const el = document.getElementById(activeId);
      if (el) {
        el.focus();
        if (selStart !== null && typeof el.setSelectionRange === 'function') {
          try { el.setSelectionRange(selStart, selStart); } catch (_) {}
        }
      }
    }
  }

  function focusTruck(truckCodeOrList, opts = {}) {
    const list = Array.isArray(truckCodeOrList) ? truckCodeOrList : [truckCodeOrList];
    const clean = list.map(canonTruckCode).filter(Boolean);
    if (!clean.length) {
      applyCohort('bdeir');
    } else {
      state.selectedTrucks = clean;
      if (clean.length === 3 && BDEIR_CODES.every(c => clean.includes(c))) {
        state.cohort = 'bdeir';
      } else {
        state.cohort = 'custom';
      }
      normalizeSelectedTrucks();
    }
    if (opts.tab) state.tab = opts.tab;
    if (opts.mode) state.mode = opts.mode;
    if (opts.scope) state.scope = opts.scope;
    refreshAllCockpits();
    if (opts.scroll) {
      const el = document.getElementById('fleetRevCostCockpit') || document.getElementById('pbiFleetRevCostCockpit');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  let _delegatedBound = false;
  function ensureDelegatedEvents() {
    if (_delegatedBound || typeof document === 'undefined') return;
    _delegatedBound = true;

    /* Capture phase so inline P&L button inside .rrow intercepts before 360 Inspector */
    document.addEventListener('click', (e) => {
      const extFocus = e.target && e.target.closest ? e.target.closest('[data-fpnl-focus-unit]') : null;
      if (extFocus) {
        e.preventDefault();
        e.stopPropagation();
        const unitCode = extFocus.getAttribute('data-fpnl-focus-unit') || '';
        if (unitCode) focusTruck(unitCode, { scroll: true });
      }
    }, true);

    document.addEventListener('click', (e) => {
      /* External row-level Focus P&L button */
      const extFocus = e.target.closest('[data-fpnl-focus-unit]');
      if (extFocus) {
        e.preventDefault();
        e.stopPropagation();
        const unitCode = extFocus.getAttribute('data-fpnl-focus-unit') || '';
        if (unitCode) focusTruck(unitCode, { scroll: true });
        return;
      }

      /* Close picker when clicking outside */
      if (state.pickerOpen && !e.target.closest('#fpnlTruckPickerWrap')) {
        state.pickerOpen = false;
        refreshAllCockpits();
      }

      const pickerToggle = e.target.closest('[data-fpnl-picker-toggle]');
      if (pickerToggle) {
        e.preventDefault();
        state.pickerOpen = !state.pickerOpen;
        refreshAllCockpits();
        if (state.pickerOpen) {
          setTimeout(() => {
            const inp = document.getElementById('fpnlPickerSearch');
            if (inp) inp.focus();
          }, 20);
        }
        return;
      }

      if (e.target.closest('[data-fpnl-picker-close]')) {
        e.preventDefault();
        state.pickerOpen = false;
        refreshAllCockpits();
        return;
      }

      if (e.target.closest('[data-fpnl-picker-all]')) {
        e.preventDefault();
        const shown = searchTruckCatalog(getMasterTruckCatalog(), state.pickerSearch).slice(0, 15).map(t => t.code);
        if (shown.length) {
          state.cohort = 'custom';
          state.selectedTrucks = shown;
          normalizeSelectedTrucks();
          refreshAllCockpits();
        }
        return;
      }

      const onlyBtn = e.target.closest('[data-fpnl-only-truck]');
      if (onlyBtn) {
        e.preventDefault();
        const code = canonTruckCode(onlyBtn.getAttribute('data-fpnl-only-truck'));
        if (code) {
          state.pickerOpen = false;
          state.cohort = 'custom';
          state.selectedTrucks = [code];
          normalizeSelectedTrucks();
          refreshAllCockpits();
        }
        return;
      }

      const cohortBtn = e.target.closest('[data-fpnl-cohort]');
      if (cohortBtn) {
        e.preventDefault();
        const ck = cohortBtn.getAttribute('data-fpnl-cohort') || 'bdeir';
        state.pickerOpen = false;
        applyCohort(ck);
        refreshAllCockpits();
        return;
      }

      if (e.target.closest('[data-fpnl-all-cohort]')) {
        e.preventDefault();
        const ck = state.cohort === 'custom' ? 'bdeir' : state.cohort;
        applyCohort(ck);
        refreshAllCockpits();
        return;
      }

      const selTruckBtn = e.target.closest('[data-fpnl-select-truck]');
      if (selTruckBtn) {
        e.preventDefault();
        const code = canonTruckCode(selTruckBtn.getAttribute('data-fpnl-select-truck'));
        if (!code) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          if (state.selectedTrucks.includes(code)) {
            if (state.selectedTrucks.length > 1) {
              state.selectedTrucks = state.selectedTrucks.filter(c => c !== code);
            }
          } else {
            state.selectedTrucks = state.selectedTrucks.concat([code]);
          }
        } else {
          const cohortCodes = getCohortCodes(state.cohort === 'custom' ? 'bdeir' : state.cohort);
          if (state.selectedTrucks.length === 1 && state.selectedTrucks[0] === code && cohortCodes.length > 1) {
            state.selectedTrucks = cohortCodes;
          } else {
            state.selectedTrucks = [code];
          }
        }
        normalizeSelectedTrucks();
        refreshAllCockpits();
        return;
      }

      const multiTruckBtn = e.target.closest('[data-fpnl-multi-truck]');
      if (multiTruckBtn) {
        e.preventDefault();
        const code = canonTruckCode(multiTruckBtn.getAttribute('data-fpnl-multi-truck'));
        if (!code) return;
        if (state.selectedTrucks.includes(code)) {
          if (state.selectedTrucks.length > 1) {
            state.selectedTrucks = state.selectedTrucks.filter(c => c !== code);
          }
        } else {
          state.selectedTrucks = state.selectedTrucks.concat([code]);
        }
        normalizeSelectedTrucks();
        refreshAllCockpits();
        return;
      }

      const coBtn = e.target.closest('[data-fpnl-co]');
      if (coBtn) {
        e.preventDefault();
        state.coFilter = coBtn.getAttribute('data-fpnl-co') || 'ALL';
        normalizeSelectedTrucks();
        refreshAllCockpits();
        return;
      }

      if (e.target.closest('[data-fpnl-reset]')) {
        e.preventDefault();
        state.coFilter = 'ALL';
        state.scope = 'cutover';
        state.pickerOpen = false;
        state.pickerSearch = '';
        applyCohort('bdeir');
        refreshAllCockpits();
        return;
      }

      const jumpBtn = e.target.closest('[data-fpnl-jump]');
      if (jumpBtn) {
        e.preventDefault();
        const tab = jumpBtn.getAttribute('data-fpnl-jump') || 'pnl';
        const mode = jumpBtn.getAttribute('data-fpnl-jump-mode') || '';
        window.MFG_FLEET_PNL.openTab(tab, mode || undefined);
        return;
      }

      const scopeBtn = e.target.closest('[data-fpnl-scope]');
      if (scopeBtn) {
        const nextScope = scopeBtn.getAttribute('data-fpnl-scope') || 'cutover';
        state.scope = nextScope;
        if (nextScope === 'cutover') {
          const bdeirSub = state.selectedTrucks.filter(c => BDEIR_CODES.includes(c));
          state.selectedTrucks = bdeirSub.length ? bdeirSub : BDEIR_CODES.slice();
          if (state.selectedTrucks.length === 3) state.cohort = 'bdeir';
          if (state.coFilter === 'Lions Transport') state.coFilter = 'ALL';
        }
        refreshAllCockpits();
        return;
      }

      const modeBtn = e.target.closest('[data-fpnl-mode]');
      if (modeBtn) {
        state.mode = modeBtn.getAttribute('data-fpnl-mode') || 'recorded';
        refreshAllCockpits();
        return;
      }

      const tabBtn = e.target.closest('[data-fpnl-tab]');
      if (tabBtn) {
        state.tab = tabBtn.getAttribute('data-fpnl-tab') || 'pnl';
        refreshAllCockpits();
        return;
      }
    });

    const inputMap = {
      fpnlPickerSearch: 'pickerSearch',
      fpnlZeroSearch: 'zeroSearch',
      fpnlRouteSearch: 'routeSearch',
      fpnlExpSearch: 'expSearch',
      fpnlOtSearch: 'otSearch'
    };

    const selectMap = {
      fpnlZeroStream: 'zeroStream',
      fpnlRouteStream: 'routeStream',
      fpnlRoutePricing: 'routePricing',
      fpnlExpPeriod: 'expPeriod',
      fpnlExpCat: 'expCat',
      fpnlOtStream: 'otStream',
      fpnlOtDriver: 'otDriver'
    };

    document.addEventListener('input', (e) => {
      const id = e.target && e.target.id;
      if (id && inputMap[id]) {
        state[inputMap[id]] = e.target.value;
        refreshAllCockpits();
      }
    });

    document.addEventListener('change', (e) => {
      const t = e.target;
      if (!t) return;
      const chkCode = t.getAttribute && t.getAttribute('data-fpnl-toggle-truck');
      if (chkCode) {
        const code = canonTruckCode(chkCode);
        if (t.checked) {
          if (!state.selectedTrucks.includes(code)) state.selectedTrucks = state.selectedTrucks.concat([code]);
        } else if (state.selectedTrucks.length > 1) {
          state.selectedTrucks = state.selectedTrucks.filter(c => c !== code);
        }
        state.cohort = 'custom';
        normalizeSelectedTrucks();
        refreshAllCockpits();
        return;
      }
      const id = t.id;
      if (id && selectMap[id]) {
        state[selectMap[id]] = t.value;
        refreshAllCockpits();
      }
    });
  }

  ensureDelegatedEvents();

  window.MFG_FLEET_PNL = {
    state,
    data: CUTOVER_DATA,
    base: CUTOVER_TRUCK_BASE,
    getMasterTruckCatalog,
    searchTruckCatalog,
    focusTruck,
    renderCockpitHtml,
    mountAllCockpits: ensureDelegatedEvents,
    refreshAllCockpits,
    openTab(tabName, modeName, truckCode) {
      if (tabName) state.tab = tabName;
      if (modeName) state.mode = modeName;
      if (truckCode) focusTruck(truckCode);
      const navBtn = document.querySelector('[data-view="fleet_equip"]');
      if (navBtn) navBtn.click();
      else if (typeof window.navigateToView === 'function') window.navigateToView('fleet_equip');
      else location.hash = '#fleet_equip';
      setTimeout(() => {
        refreshAllCockpits();
        const next = document.getElementById('fleetRevCostCockpit');
        if (next) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };
})();
