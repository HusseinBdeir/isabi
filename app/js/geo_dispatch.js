/* ==================== ISABI GEO STUDIO, KM ENGINE & 24H CROSS-POOL DISPATCH (v19.6.0) ==================== */
(function () {
  'use strict';

  const STORAGE_KEY = 'isabi_mfg_geo_v1';
  const BU_LIST = ['WTC', 'BBConstruction', 'Lions Transport'];

  // Default Company BU Hubs (inside their respective Region zones; 1-click movable on map)
  const DEFAULT_BU_HUBS = {
    'WTC': { name: 'WTC', label: 'WTC Main Plant & Hub', lat: 33.8938, lng: 35.4820, region: 'Beirut' },
    'BBConstruction': { name: 'BBConstruction', label: 'BBConstruction Sibline Plant', lat: 33.6255, lng: 35.4218, region: 'Sibline' },
    'Lions Transport': { name: 'Lions Transport', label: 'Lions Transport Fleet Yard', lat: 33.8865, lng: 35.5180, region: 'Beirut' }
  };

  // Approved OpenStreetMap municipal/governorate polygon boundaries for Lebanon regions
  const BASELINE_POLYGONS = {"Beirut":{"zone_type":"polygon","center_lat":33.88918,"center_lng":35.50469,"geojson":{"type":"Polygon","coordinates":[[[35.46681,33.89321],[35.47142,33.891],[35.47152,33.88937],[35.4714,33.88911],[35.46823,33.88768],[35.47202,33.88705],[35.47047,33.88583],[35.47185,33.88638],[35.47302,33.88532],[35.4721,33.8824],[35.47238,33.88383],[35.47362,33.88386],[35.47367,33.88306],[35.47267,33.88302],[35.47287,33.88284],[35.47371,33.88285],[35.47438,33.88409],[35.47481,33.88411],[35.47817,33.88244],[35.48034,33.87627],[35.48077,33.86789],[35.50321,33.86773],[35.50267,33.86534],[35.50302,33.86315],[35.50639,33.86233],[35.51052,33.86295],[35.50978,33.86364],[35.50887,33.86573],[35.50893,33.86625],[35.50951,33.86758],[35.51713,33.87195],[35.51757,33.87242],[35.51874,33.8749],[35.52348,33.8773],[35.52563,33.87757],[35.52804,33.87699],[35.5298,33.87734],[35.53034,33.87809],[35.53397,33.89022],[35.5368,33.89508],[35.53918,33.90199],[35.53927,33.90315],[35.54117,33.90492],[35.5421,33.90518],[35.54035,33.90462],[35.54256,33.90798],[35.54249,33.90861],[35.53057,33.90926],[35.53094,33.90674],[35.52657,33.90492],[35.52615,33.90489],[35.52577,33.90756],[35.52359,33.90639],[35.5237,33.90323],[35.51978,33.9009],[35.51894,33.90395],[35.51688,33.903],[35.51626,33.89995],[35.51304,33.90032],[35.51303,33.90216],[35.51101,33.90184],[35.51088,33.89953],[35.50772,33.90071],[35.50777,33.90295],[35.5116,33.90385],[35.51189,33.90333],[35.51734,33.90552],[35.52638,33.91038],[35.53305,33.91604],[35.52534,33.91004],[35.51656,33.9054],[35.51279,33.90428],[35.51194,33.90521],[35.50784,33.9035],[35.50784,33.9048],[35.5142,33.90627],[35.51404,33.90712],[35.51154,33.90659],[35.51092,33.90839],[35.50933,33.90836],[35.49921,33.90562],[35.49787,33.90461],[35.4971,33.90425],[35.49849,33.90352],[35.49655,33.90181],[35.49609,33.90191],[35.4949,33.90302],[35.4973,33.9056],[35.48933,33.90152],[35.48262,33.90276],[35.48209,33.90368],[35.47355,33.90149],[35.47285,33.90224],[35.47221,33.90187],[35.47231,33.90082],[35.46892,33.90016],[35.46976,33.89932],[35.46856,33.90041],[35.46976,33.8979],[35.4678,33.89935],[35.46785,33.89638],[35.46985,33.89618],[35.46746,33.89601],[35.46692,33.89445],[35.46789,33.89445],[35.46791,33.8939],[35.467,33.89381],[35.46707,33.89335],[35.46681,33.89321]]]}},"Jnoub":{"zone_type":"polygon","center_lat":33.33872,"center_lng":35.37054,"geojson":{"type":"MultiPolygon","coordinates":[[[[35.10356,33.0943],[35.15555,33.09152],[35.15642,33.08638],[35.17769,33.09419],[35.19355,33.08544],[35.20752,33.08757],[35.2117,33.09975],[35.22625,33.09858],[35.2388,33.09217],[35.30321,33.10954],[35.29942,33.13725],[35.30759,33.14315],[35.3102,33.16178],[35.32223,33.16497],[35.31205,33.17848],[35.33197,33.17096],[35.34865,33.18911],[35.33993,33.20027],[35.3513,33.19833],[35.36038,33.19854],[35.36122,33.19944],[35.36274,33.20559],[35.3789,33.2071],[35.35692,33.21812],[35.35838,33.22106],[35.36645,33.22594],[35.38323,33.22659],[35.38539,33.22915],[35.38445,33.23851],[35.38788,33.24323],[35.39383,33.2483],[35.407,33.23732],[35.41134,33.24131],[35.41548,33.24251],[35.40965,33.26207],[35.41687,33.26541],[35.416,33.27141],[35.42331,33.26892],[35.43053,33.27335],[35.42958,33.27518],[35.42943,33.28324],[35.41425,33.28417],[35.41578,33.28687],[35.40997,33.29279],[35.41451,33.3023],[35.42087,33.30334],[35.42522,33.30329],[35.42619,33.3055],[35.42967,33.3117],[35.42816,33.31156],[35.42069,33.31575],[35.41998,33.30954],[35.40464,33.30039],[35.39007,33.31121],[35.38484,33.30605],[35.37471,33.30593],[35.36675,33.31287],[35.35732,33.30865],[35.35744,33.31068],[35.35687,33.31226],[35.34652,33.31424],[35.3487,33.32101],[35.34113,33.31792],[35.34415,33.32729],[35.35725,33.33194],[35.3636,33.33972],[35.36545,33.35577],[35.34898,33.34984],[35.34773,33.35591],[35.33583,33.36216],[35.3276,33.36422],[35.32345,33.36019],[35.31878,33.36417],[35.29458,33.36622],[35.29956,33.36951],[35.31495,33.36471],[35.31982,33.37653],[35.30929,33.37997],[35.32115,33.38461],[35.31384,33.38967],[35.32519,33.39582],[35.32493,33.40128],[35.33046,33.39424],[35.34182,33.40288],[35.34471,33.39294],[35.35743,33.38594],[35.36272,33.37781],[35.38251,33.37742],[35.36792,33.38708],[35.37209,33.3955],[35.40503,33.40617],[35.38985,33.42086],[35.38955,33.42299],[35.39177,33.42919],[35.38719,33.43652],[35.39421,33.45819],[35.41937,33.45013],[35.41874,33.45567],[35.42787,33.46157],[35.40709,33.47604],[35.42516,33.47929],[35.43134,33.48853],[35.44123,33.48005],[35.45091,33.48099],[35.45026,33.47688],[35.45554,33.4758],[35.46072,33.48087],[35.45919,33.49011],[35.46574,33.48646],[35.47963,33.49576],[35.48654,33.48652],[35.50042,33.49271],[35.5015,33.49787],[35.51249,33.49535],[35.52571,33.51217],[35.52854,33.51052],[35.53124,33.51177],[35.53112,33.50812],[35.52914,33.50394],[35.53245,33.50318],[35.53631,33.50949],[35.55111,33.50517],[35.52112,33.45903],[35.53721,33.45157],[35.53031,33.44706],[35.5231,33.4272],[35.54129,33.42014],[35.52618,33.39426],[35.52777,33.39076],[35.52382,33.38996],[35.52364,33.38739],[35.5238,33.36987],[35.52432,33.3672],[35.53107,33.36591],[35.53494,33.36881],[35.53973,33.3508],[35.55003,33.3596],[35.55446,33.37491],[35.56502,33.38121],[35.59253,33.38183],[35.59575,33.39462],[35.60832,33.40404],[35.61055,33.41303],[35.61759,33.41609],[35.62251,33.41188],[35.62469,33.42091],[35.62712,33.4232],[35.63061,33.42485],[35.62813,33.43078],[35.63751,33.44494],[35.62308,33.44605],[35.6124,33.43015],[35.60879,33.43022],[35.60772,33.43241],[35.62333,33.48738],[35.62181,33.49363],[35.61358,33.49646],[35.61715,33.53527],[35.60221,33.54949],[35.60064,33.5624],[35.60555,33.57136],[35.59611,33.59049],[35.5931,33.59201],[35.58815,33.58942],[35.58894,33.58711],[35.58873,33.58598],[35.58133,33.59006],[35.57783,33.5834],[35.57731,33.59147],[35.55402,33.58611],[35.54856,33.59005],[35.53373,33.57996],[35.51768,33.58143],[35.50569,33.57319],[35.47574,33.57143],[35.47319,33.56437],[35.47124,33.56888],[35.46602,33.56474],[35.45655,33.56928],[35.4511,33.56664],[35.44623,33.57473],[35.44534,33.571],[35.43945,33.57494],[35.43415,33.5709],[35.42369,33.58095],[35.40513,33.58158],[35.38605,33.58906],[35.37532,33.5677],[35.36689,33.56607],[35.36744,33.55644],[35.36311,33.55785],[35.36373,33.5629],[35.36002,33.5306],[35.35125,33.51119],[35.34088,33.50751],[35.34303,33.50512],[35.31398,33.47256],[35.28907,33.46322],[35.27568,33.44697],[35.26688,33.41267],[35.2616,33.41394],[35.26446,33.40857],[35.25112,33.38019],[35.24505,33.33359],[35.22296,33.30846],[35.21792,33.28736],[35.21582,33.28338],[35.21119,33.27768],[35.20227,33.27249],[35.1906,33.2754],[35.1914,33.26708],[35.19884,33.26777],[35.20811,33.26087],[35.21233,33.24097],[35.20507,33.20467],[35.19628,33.19691],[35.19161,33.17918],[35.18085,33.16563],[35.16698,33.16378],[35.1445,33.12631],[35.11285,33.11254],[35.10442,33.096],[35.10356,33.0943]]]]}},"Dekwaneh":{"zone_type":"polygon","center_lat":33.87618,"center_lng":35.54635,"geojson":{"type":"Polygon","coordinates":[[[35.53982,33.88084],[35.54246,33.86871],[35.54581,33.86568],[35.5509,33.86781],[35.55289,33.86754],[35.55064,33.87235],[35.55048,33.87377],[35.55257,33.87847],[35.55134,33.88046],[35.54998,33.88649],[35.5496,33.88669],[35.54903,33.88642],[35.53982,33.88084]]]}},"Sibline":{"zone_type":"polygon","center_lat":33.62553,"center_lng":35.4218,"geojson":{"type":"Polygon","coordinates":[[[35.3985,33.62223],[35.39893,33.61621],[35.40852,33.61996],[35.41509,33.62093],[35.42799,33.61451],[35.43991,33.61559],[35.44511,33.62254],[35.44001,33.6267],[35.43894,33.62907],[35.4386,33.63024],[35.43371,33.63343],[35.43315,33.63426],[35.43235,33.63656],[35.42207,33.63306],[35.41374,33.62695],[35.40728,33.62597],[35.39932,33.62661],[35.39869,33.62301],[35.3985,33.62223]]]}},"south":{"zone_type":"polygon","center_lat":33.33872,"center_lng":35.37054,"geojson":{"type":"MultiPolygon","coordinates":[[[[35.10356,33.0943],[35.15555,33.09152],[35.15642,33.08638],[35.17769,33.09419],[35.19355,33.08544],[35.20752,33.08757],[35.2117,33.09975],[35.22625,33.09858],[35.2388,33.09217],[35.30321,33.10954],[35.29942,33.13725],[35.30759,33.14315],[35.3102,33.16178],[35.32223,33.16497],[35.31205,33.17848],[35.33197,33.17096],[35.34865,33.18911],[35.33993,33.20027],[35.3513,33.19833],[35.36038,33.19854],[35.36122,33.19944],[35.36274,33.20559],[35.3789,33.2071],[35.35692,33.21812],[35.35838,33.22106],[35.36645,33.22594],[35.38323,33.22659],[35.38539,33.22915],[35.38445,33.23851],[35.38788,33.24323],[35.39383,33.2483],[35.407,33.23732],[35.41134,33.24131],[35.41548,33.24251],[35.40965,33.26207],[35.41687,33.26541],[35.416,33.27141],[35.42331,33.26892],[35.43053,33.27335],[35.42958,33.27518],[35.42943,33.28324],[35.41425,33.28417],[35.41578,33.28687],[35.40997,33.29279],[35.41451,33.3023],[35.42087,33.30334],[35.42522,33.30329],[35.42619,33.3055],[35.42967,33.3117],[35.42816,33.31156],[35.42069,33.31575],[35.41998,33.30954],[35.40464,33.30039],[35.39007,33.31121],[35.38484,33.30605],[35.37471,33.30593],[35.36675,33.31287],[35.35732,33.30865],[35.35744,33.31068],[35.35687,33.31226],[35.34652,33.31424],[35.3487,33.32101],[35.34113,33.31792],[35.34415,33.32729],[35.35725,33.33194],[35.3636,33.33972],[35.36545,33.35577],[35.34898,33.34984],[35.34773,33.35591],[35.33583,33.36216],[35.3276,33.36422],[35.32345,33.36019],[35.31878,33.36417],[35.29458,33.36622],[35.29956,33.36951],[35.31495,33.36471],[35.31982,33.37653],[35.30929,33.37997],[35.32115,33.38461],[35.31384,33.38967],[35.32519,33.39582],[35.32493,33.40128],[35.33046,33.39424],[35.34182,33.40288],[35.34471,33.39294],[35.35743,33.38594],[35.36272,33.37781],[35.38251,33.37742],[35.36792,33.38708],[35.37209,33.3955],[35.40503,33.40617],[35.38985,33.42086],[35.38955,33.42299],[35.39177,33.42919],[35.38719,33.43652],[35.39421,33.45819],[35.41937,33.45013],[35.41874,33.45567],[35.42787,33.46157],[35.40709,33.47604],[35.42516,33.47929],[35.43134,33.48853],[35.44123,33.48005],[35.45091,33.48099],[35.45026,33.47688],[35.45554,33.4758],[35.46072,33.48087],[35.45919,33.49011],[35.46574,33.48646],[35.47963,33.49576],[35.48654,33.48652],[35.50042,33.49271],[35.5015,33.49787],[35.51249,33.49535],[35.52571,33.51217],[35.52854,33.51052],[35.53124,33.51177],[35.53112,33.50812],[35.52914,33.50394],[35.53245,33.50318],[35.53631,33.50949],[35.55111,33.50517],[35.52112,33.45903],[35.53721,33.45157],[35.53031,33.44706],[35.5231,33.4272],[35.54129,33.42014],[35.52618,33.39426],[35.52777,33.39076],[35.52382,33.38996],[35.52364,33.38739],[35.5238,33.36987],[35.52432,33.3672],[35.53107,33.36591],[35.53494,33.36881],[35.53973,33.3508],[35.55003,33.3596],[35.55446,33.37491],[35.56502,33.38121],[35.59253,33.38183],[35.59575,33.39462],[35.60832,33.40404],[35.61055,33.41303],[35.61759,33.41609],[35.62251,33.41188],[35.62469,33.42091],[35.62712,33.4232],[35.63061,33.42485],[35.62813,33.43078],[35.63751,33.44494],[35.62308,33.44605],[35.6124,33.43015],[35.60879,33.43022],[35.60772,33.43241],[35.62333,33.48738],[35.62181,33.49363],[35.61358,33.49646],[35.61715,33.53527],[35.60221,33.54949],[35.60064,33.5624],[35.60555,33.57136],[35.59611,33.59049],[35.5931,33.59201],[35.58815,33.58942],[35.58894,33.58711],[35.58873,33.58598],[35.58133,33.59006],[35.57783,33.5834],[35.57731,33.59147],[35.55402,33.58611],[35.54856,33.59005],[35.53373,33.57996],[35.51768,33.58143],[35.50569,33.57319],[35.47574,33.57143],[35.47319,33.56437],[35.47124,33.56888],[35.46602,33.56474],[35.45655,33.56928],[35.4511,33.56664],[35.44623,33.57473],[35.44534,33.571],[35.43945,33.57494],[35.43415,33.5709],[35.42369,33.58095],[35.40513,33.58158],[35.38605,33.58906],[35.37532,33.5677],[35.36689,33.56607],[35.36744,33.55644],[35.36311,33.55785],[35.36373,33.5629],[35.36002,33.5306],[35.35125,33.51119],[35.34088,33.50751],[35.34303,33.50512],[35.31398,33.47256],[35.28907,33.46322],[35.27568,33.44697],[35.26688,33.41267],[35.2616,33.41394],[35.26446,33.40857],[35.25112,33.38019],[35.24505,33.33359],[35.22296,33.30846],[35.21792,33.28736],[35.21582,33.28338],[35.21119,33.27768],[35.20227,33.27249],[35.1906,33.2754],[35.1914,33.26708],[35.19884,33.26777],[35.20811,33.26087],[35.21233,33.24097],[35.20507,33.20467],[35.19628,33.19691],[35.19161,33.17918],[35.18085,33.16563],[35.16698,33.16378],[35.1445,33.12631],[35.11285,33.11254],[35.10442,33.096],[35.10356,33.0943]]]]}},"Jiyeh":{"zone_type":"polygon","center_lat":33.66537,"center_lng":35.41952,"geojson":{"type":"Polygon","coordinates":[[[35.39787,33.64646],[35.39954,33.64155],[35.4111,33.64078],[35.41175,33.64133],[35.41518,33.6433],[35.41428,33.6478],[35.41492,33.64914],[35.419,33.64964],[35.42235,33.6516],[35.42398,33.65394],[35.42757,33.65461],[35.43151,33.66607],[35.43141,33.67103],[35.43194,33.67578],[35.43481,33.67548],[35.43355,33.67821],[35.43563,33.68007],[35.44116,33.6806],[35.44116,33.68764],[35.44061,33.68796],[35.4296,33.68684],[35.42917,33.68762],[35.42917,33.68905],[35.41743,33.68997],[35.41591,33.68862],[35.41878,33.68306],[35.41763,33.68167],[35.41811,33.68152],[35.41797,33.68026],[35.41679,33.68008],[35.41799,33.6791],[35.41718,33.67843],[35.41793,33.67609],[35.41733,33.67019],[35.41632,33.66908],[35.41761,33.66859],[35.41736,33.66817],[35.41657,33.66769],[35.41453,33.66843],[35.41529,33.66728],[35.41409,33.66722],[35.41433,33.66885],[35.41399,33.66888],[35.41367,33.66853],[35.41366,33.66714],[35.41385,33.66685],[35.41662,33.66729],[35.41759,33.66455],[35.41511,33.65372],[35.41251,33.65255],[35.41254,33.65112],[35.41147,33.65215],[35.41266,33.65329],[35.41248,33.65332],[35.41155,33.65253],[35.41171,33.65076],[35.4079,33.65078],[35.40749,33.6494],[35.4053,33.65008],[35.40519,33.65275],[35.40471,33.65291],[35.40405,33.64895],[35.4005,33.64886],[35.40256,33.65113],[35.39909,33.64905],[35.39792,33.64703],[35.39787,33.64646]]]}},"jiyeh jv":{"zone_type":"polygon","center_lat":33.66537,"center_lng":35.41952,"geojson":{"type":"Polygon","coordinates":[[[35.39787,33.64646],[35.39954,33.64155],[35.4111,33.64078],[35.41175,33.64133],[35.41518,33.6433],[35.41428,33.6478],[35.41492,33.64914],[35.419,33.64964],[35.42235,33.6516],[35.42398,33.65394],[35.42757,33.65461],[35.43151,33.66607],[35.43141,33.67103],[35.43194,33.67578],[35.43481,33.67548],[35.43355,33.67821],[35.43563,33.68007],[35.44116,33.6806],[35.44116,33.68764],[35.44061,33.68796],[35.4296,33.68684],[35.42917,33.68762],[35.42917,33.68905],[35.41743,33.68997],[35.41591,33.68862],[35.41878,33.68306],[35.41763,33.68167],[35.41811,33.68152],[35.41797,33.68026],[35.41679,33.68008],[35.41799,33.6791],[35.41718,33.67843],[35.41793,33.67609],[35.41733,33.67019],[35.41632,33.66908],[35.41761,33.66859],[35.41736,33.66817],[35.41657,33.66769],[35.41453,33.66843],[35.41529,33.66728],[35.41409,33.66722],[35.41433,33.66885],[35.41399,33.66888],[35.41367,33.66853],[35.41366,33.66714],[35.41385,33.66685],[35.41662,33.66729],[35.41759,33.66455],[35.41511,33.65372],[35.41251,33.65255],[35.41254,33.65112],[35.41147,33.65215],[35.41266,33.65329],[35.41248,33.65332],[35.41155,33.65253],[35.41171,33.65076],[35.4079,33.65078],[35.40749,33.6494],[35.4053,33.65008],[35.40519,33.65275],[35.40471,33.65291],[35.40405,33.64895],[35.4005,33.64886],[35.40256,33.65113],[35.39909,33.64905],[35.39792,33.64703],[35.39787,33.64646]]]}},"Nabatieh":{"zone_type":"polygon","center_lat":33.37896,"center_lng":35.48699,"geojson":{"type":"Polygon","coordinates":[[[35.46712,33.38388],[35.46957,33.38263],[35.46772,33.38047],[35.46717,33.38008],[35.46869,33.37901],[35.46861,33.37705],[35.47037,33.37689],[35.46985,33.37562],[35.46833,33.37553],[35.46904,33.37498],[35.4682,33.37367],[35.46912,33.37307],[35.46968,33.37187],[35.46931,33.37084],[35.47095,33.37045],[35.4705,33.36749],[35.47104,33.36708],[35.47177,33.36554],[35.47129,33.3631],[35.46982,33.36072],[35.47387,33.3629],[35.47891,33.36248],[35.47845,33.36385],[35.47857,33.36423],[35.48508,33.36444],[35.48704,33.368],[35.48609,33.36834],[35.48642,33.3691],[35.48785,33.36976],[35.48959,33.36969],[35.49017,33.37023],[35.48993,33.37144],[35.49316,33.3728],[35.49554,33.37193],[35.49656,33.37343],[35.49873,33.37338],[35.49921,33.37416],[35.50155,33.37338],[35.50149,33.37422],[35.50525,33.3742],[35.50686,33.37579],[35.50565,33.38061],[35.50253,33.37875],[35.50156,33.37952],[35.49728,33.378],[35.49587,33.37869],[35.49713,33.38155],[35.49586,33.38293],[35.49207,33.38455],[35.4903,33.38675],[35.48952,33.38629],[35.48864,33.38758],[35.48825,33.39033],[35.48864,33.39444],[35.48749,33.39458],[35.48824,33.39645],[35.48825,33.3972],[35.48581,33.39413],[35.48623,33.39266],[35.4822,33.39267],[35.48154,33.3922],[35.48344,33.39093],[35.48295,33.39024],[35.48031,33.39106],[35.48052,33.38972],[35.47905,33.38861],[35.47692,33.38985],[35.47733,33.39043],[35.47491,33.39013],[35.47244,33.39119],[35.46962,33.38979],[35.47076,33.3885],[35.4698,33.38525],[35.46849,33.38517],[35.46712,33.38388]]]}},"Halat JV":{"zone_type":"polygon","center_lat":34.08688,"center_lng":35.66754,"geojson":{"type":"Polygon","coordinates":[[[35.64554,34.07612],[35.65145,34.0741],[35.65284,34.07497],[35.65483,34.07485],[35.65795,34.07358],[35.65761,34.0718],[35.66225,34.07359],[35.66521,34.07326],[35.66816,34.07589],[35.67896,34.0797],[35.67963,34.08127],[35.68086,34.08227],[35.68128,34.08245],[35.68582,34.08307],[35.68443,34.0872],[35.68291,34.08917],[35.68673,34.09365],[35.68954,34.0958],[35.68797,34.09859],[35.65069,34.10195],[35.64853,34.0986],[35.65038,34.09804],[35.64967,34.0975],[35.65088,34.09692],[35.64981,34.09577],[35.65102,34.09501],[35.64885,34.09316],[35.64928,34.09221],[35.6491,34.09149],[35.64811,34.09161],[35.6484,34.09359],[35.64814,34.09377],[35.64787,34.09346],[35.64771,34.09184],[35.64768,34.09128],[35.64896,34.09105],[35.64966,34.0862],[35.64596,34.07652],[35.64554,34.07612]]]}},"sinai":{"zone_type":"polygon","center_lat":33.38961,"center_lng":35.3625,"geojson":{"type":"Polygon","coordinates":[[[35.3425,33.40013],[35.34526,33.39822],[35.34409,33.39603],[35.34576,33.39576],[35.34471,33.39294],[35.34718,33.39186],[35.34945,33.38848],[35.35102,33.3882],[35.3536,33.38812],[35.35743,33.38594],[35.35647,33.38267],[35.35793,33.38278],[35.35889,33.38122],[35.36272,33.37781],[35.36973,33.37581],[35.38251,33.37742],[35.37766,33.37764],[35.37519,33.37988],[35.37166,33.3825],[35.36792,33.38708],[35.36941,33.39146],[35.35774,33.39544],[35.35521,33.39526],[35.35604,33.40012],[35.35287,33.40207],[35.35006,33.40128],[35.34873,33.403],[35.34576,33.40341],[35.34495,33.403],[35.34426,33.40153],[35.3425,33.40013]]]}},"Borj Hammoud 2":{"zone_type":"polygon","center_lat":33.89301,"center_lng":35.54337,"geojson":{"type":"Polygon","coordinates":[[[35.53397,33.89022],[35.53618,33.8898],[35.53687,33.88578],[35.53931,33.88193],[35.53982,33.88084],[35.5496,33.88669],[35.54859,33.88672],[35.54759,33.8916],[35.54781,33.8917],[35.55026,33.89123],[35.55048,33.89219],[35.55009,33.8931],[35.55275,33.89879],[35.54966,33.89824],[35.55056,33.89977],[35.55165,33.90023],[35.55277,33.89919],[35.5523,33.90093],[35.55054,33.90066],[35.55172,33.90186],[35.54899,33.90512],[35.5421,33.90518],[35.54117,33.90492],[35.53927,33.90315],[35.53918,33.90199],[35.5368,33.89508],[35.53646,33.89428],[35.53454,33.89135],[35.53397,33.89022]]]}},"Aawkar":{"zone_type":"polygon","center_lat":33.93399,"center_lng":35.60018,"geojson":{"type":"Polygon","coordinates":[[[35.59278,33.93179],[35.59726,33.9305],[35.60269,33.93381],[35.60446,33.93465],[35.60727,33.93403],[35.60757,33.93475],[35.60075,33.93749],[35.59617,33.93729],[35.59459,33.93407],[35.59278,33.93179]]]}}};

  // Baseline circles & corridors for sub-municipal Lebanese geographic regions
  const BASELINE_CIRCLES = {
    'Mar Elias': { zone_type: 'circle', center_lat: 33.8814, center_lng: 35.4858, radius_km: 1.0, distance_km: 3 },
    'spinneys Mar Elias': { zone_type: 'circle', center_lat: 33.8819, center_lng: 35.4864, radius_km: 0.75, distance_km: 3 },
    'spinneys Mar Elias0': { zone_type: 'circle', center_lat: 33.8819, center_lng: 35.4864, radius_km: 0.85, distance_km: 3 },
    'spinneys Mar Elias1': { zone_type: 'circle', center_lat: 33.8819, center_lng: 35.4864, radius_km: 0.95, distance_km: 3 },
    'cola': { zone_type: 'circle', center_lat: 33.8780, center_lng: 35.4982, radius_km: 0.9, distance_km: 4 },
    'Talet Khayat': { zone_type: 'circle', center_lat: 33.8842, center_lng: 35.4908, radius_km: 0.85, distance_km: 3 },
    'Goulf': { zone_type: 'circle', center_lat: 33.8548, center_lng: 35.4882, radius_km: 1.25, distance_km: 6 },
    'River': { zone_type: 'circle', center_lat: 33.8986, center_lng: 35.5298, radius_km: 1.4, distance_km: 7 },
    'Naher l Mot': { zone_type: 'circle', center_lat: 33.9035, center_lng: 35.5655, radius_km: 1.7, distance_km: 11 },
    'Bsalim': { zone_type: 'circle', center_lat: 33.9138, center_lng: 35.6145, radius_km: 2.3, distance_km: 17 },
    'Ibrahim Bdeir WAZANI': { zone_type: 'circle', center_lat: 33.2745, center_lng: 35.6215, radius_km: 2.6, distance_km: 96 },
    'Halat /nahr el mot': {
      zone_type: 'polygon',
      center_lat: 33.9950,
      center_lng: 35.6120,
      distance_km: 26,
      geojson: {
        type: 'Polygon',
        coordinates: [[[35.5520, 33.8980], [35.5880, 33.9020], [35.6820, 34.0880], [35.6460, 34.0940], [35.5520, 33.8980]]]
      }
    }
  };

  // Unambiguous Lebanese town & plant coordinates for top operational sites
  const BASELINE_SITE_PINS = {
    'jiyeh jv': { lat: 33.6632, lng: 35.4214, region: 'jiyeh jv' },
    'spinneys mar elias': { lat: 33.8819, lng: 35.4864, region: 'spinneys Mar Elias' },
    'choueifat': { lat: 33.8065, lng: 35.4892, region: 'Beirut' },
    'bsalim': { lat: 33.9138, lng: 35.6145, region: 'Bsalim' },
    'bsalim gsd': { lat: 33.9162, lng: 35.6180, region: 'Bsalim' },
    'bsalim gs': { lat: 33.9119, lng: 35.6112, region: 'Bsalim' },
    'halat jv': { lat: 34.0869, lng: 35.6675, region: 'Halat JV' },
    'jiyeh': { lat: 33.6685, lng: 35.4240, region: 'Jiyeh' },
    'sibline': { lat: 33.6255, lng: 35.4218, region: 'Sibline' },
    'hatem saab': { lat: 33.6610, lng: 35.4185, region: 'Jiyeh' },
    'dawra': { lat: 33.8952, lng: 35.5478, region: 'Borj Hammoud 2' },
    'wtc': { lat: 33.8938, lng: 35.4820, region: 'Beirut' },
    'jdaide': { lat: 33.8920, lng: 35.5612, region: 'Naher l Mot' },
    'ibrahim bdeir aawkar': { lat: 33.9342, lng: 35.6011, region: 'Aawkar' },
    'haj ali aawkar': { lat: 33.9331, lng: 35.5988, region: 'Aawkar' },
    'aawkar': { lat: 33.9340, lng: 35.6002, region: 'Aawkar' },
    'goulf': { lat: 33.8548, lng: 35.4882, region: 'Goulf' },
    'al jnah': { lat: 33.8615, lng: 35.4795, region: 'Beirut' },
    'halat /nahr el mot': { lat: 33.9950, lng: 35.6120, region: 'Halat /nahr el mot' },
    'ibrahim bdeir wazani': { lat: 33.2745, lng: 35.6215, region: 'Ibrahim Bdeir WAZANI' },
    'talet khayat': { lat: 33.8842, lng: 35.4908, region: 'Talet Khayat' },
    'nahr el mot': { lat: 33.9035, lng: 35.5655, region: 'Naher l Mot' },
    'naher l mot': { lat: 33.9035, lng: 35.5655, region: 'Naher l Mot' },
    'ibrahim bdeir bremena': { lat: 33.8856, lng: 35.6435, region: 'Bsalim' },
    'gisr al bacha': { lat: 33.8672, lng: 35.5418, region: 'Dekwaneh' },
    'madar amhaz': { lat: 33.8260, lng: 35.4930, region: 'Goulf' },
    'ramle bayda amhaz': { lat: 33.8732, lng: 35.4778, region: 'Beirut' },
    'beirut': { lat: 33.8892, lng: 35.5047, region: 'Beirut' },
    'dabousi chafat': { lat: 33.8095, lng: 35.4925, region: 'Beirut' },
    'haj ali fanar': { lat: 33.8812, lng: 35.5815, region: 'Dekwaneh' },
    'radwan sidani': { lat: 33.8825, lng: 35.4852, region: 'Mar Elias' },
    'mkalles': { lat: 33.8665, lng: 35.5605, region: 'Dekwaneh' },
    'al mrayjeh': { lat: 33.8355, lng: 35.5082, region: 'Goulf' },
    'kfar chima': { lat: 33.8168, lng: 35.5342, region: 'Beirut' },
    'dekwaneh': { lat: 33.8762, lng: 35.5464, region: 'Dekwaneh' },
    'nabatieh': { lat: 33.3790, lng: 35.4870, region: 'Nabatieh' },
    'sinai': { lat: 33.3896, lng: 35.3625, region: 'sinai' },
    'borj hammoud 2': { lat: 33.8930, lng: 35.5434, region: 'Borj Hammoud 2' },
    'cola': { lat: 33.8780, lng: 35.4982, region: 'cola' },
    'mar elias': { lat: 33.8814, lng: 35.4858, region: 'Mar Elias' }
  };

  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const round1 = n => Math.round((Number(n) || 0) * 10) / 10;
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const round5 = n => Math.round((Number(n) || 0) * 100000) / 100000;
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function loadStoredConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) {}
    return { companyHubs: {}, regions: {}, sites: {}, pairKmOverrides: {}, routeKmCache: {}, updatedAt: '' };
  }

  let GEO_STORE = loadStoredConfig();
  if (!GEO_STORE.companyHubs) GEO_STORE.companyHubs = {};
  if (!GEO_STORE.regions) GEO_STORE.regions = {};
  if (!GEO_STORE.sites) GEO_STORE.sites = {};
  if (!GEO_STORE.pairKmOverrides) GEO_STORE.pairKmOverrides = {};
  if (!GEO_STORE.routeKmCache) GEO_STORE.routeKmCache = {};

  function saveStoredConfig(pushServer = true) {
    GEO_STORE.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(GEO_STORE));
    } catch (_) {}
    if (pushServer && typeof window.fetch === 'function' && !navigator.webdriver && !window.__MFG_HEADLESS_TEST) {
      try {
        fetch('./api/geo_config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: exportGeoConfig() })
        }).catch(() => {});
      } catch (_) {}
    }
    if (typeof window.__mfgScheduleCloudPush === 'function') {
      try { window.__mfgScheduleCloudPush(); } catch (_) {}
    }
  }

  function exportGeoConfig() {
    return {
      companyHubs: GEO_STORE.companyHubs || {},
      regions: GEO_STORE.regions || {},
      sites: GEO_STORE.sites || {},
      pairKmOverrides: GEO_STORE.pairKmOverrides || {},
      updatedAt: GEO_STORE.updatedAt || ''
    };
  }

  function importGeoConfig(incoming) {
    if (!incoming || typeof incoming !== 'object') return false;
    let changed = false;
    ['companyHubs', 'regions', 'sites', 'pairKmOverrides'].forEach(bucket => {
      const src = incoming[bucket];
      if (!src || typeof src !== 'object') return;
      if (!GEO_STORE[bucket]) GEO_STORE[bucket] = {};
      Object.keys(src).forEach(k => {
        const cur = GEO_STORE[bucket][k];
        const nxt = src[k];
        if (!nxt) return;
        const curTs = (cur && cur.updated_at) || '';
        const nxtTs = (nxt && nxt.updated_at) || incoming.updatedAt || '';
        if (!cur || !curTs || nxtTs >= curTs) {
          GEO_STORE[bucket][k] = nxt;
          changed = true;
        }
      });
    });
    if (changed) saveStoredConfig(false);
    return changed;
  }

  // ==================== GEOMETRY & SPATIAL CONTAINMENT ENGINE ====================
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371.0088;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function pointInCircle(lat, lng, cLat, cLng, radiusKm) {
    if (!(radiusKm > 0)) return false;
    return haversineKm(lat, lng, cLat, cLng) <= Number(radiusKm) + 0.015;
  }

  function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = Number(ring[i][0]), yi = Number(ring[i][1]);
      const xj = Number(ring[j][0]), yj = Number(ring[j][1]);
      const intersect = ((yi > lat) !== (yj > lat)) &&
        (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInGeoJson(lat, lng, gj) {
    if (!gj || !gj.type || !Array.isArray(gj.coordinates)) return false;
    if (gj.type === 'Polygon') {
      const rings = gj.coordinates;
      if (!rings.length || !pointInRing(lng, lat, rings[0])) return false;
      for (let h = 1; h < rings.length; h++) {
        if (pointInRing(lng, lat, rings[h])) return false;
      }
      return true;
    }
    if (gj.type === 'MultiPolygon') {
      for (let p = 0; p < gj.coordinates.length; p++) {
        const rings = gj.coordinates[p];
        if (!rings || !rings.length) continue;
        if (pointInRing(lng, lat, rings[0])) {
          let inHole = false;
          for (let h = 1; h < rings.length; h++) {
            if (pointInRing(lng, lat, rings[h])) { inHole = true; break; }
          }
          if (!inHole) return true;
        }
      }
    }
    return false;
  }

  function approxRingAreaKm2(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 999999;
    let minLng = 999, maxLng = -999, minLat = 999, maxLat = -999;
    ring.forEach(pt => {
      if (pt[0] < minLng) minLng = pt[0];
      if (pt[0] > maxLng) maxLng = pt[0];
      if (pt[1] < minLat) minLat = pt[1];
      if (pt[1] > maxLat) maxLat = pt[1];
    });
    const w = haversineKm((minLat + maxLat) / 2, minLng, (minLat + maxLat) / 2, maxLng);
    const h = haversineKm(minLat, (minLng + maxLng) / 2, maxLat, (minLng + maxLng) / 2);
    return Math.max(0.05, w * h * 0.72);
  }

  function regionAreaKm2(reg) {
    if (!reg) return 999999;
    if (reg.zone_type === 'circle' && Number(reg.radius_km) > 0) {
      return Math.PI * Number(reg.radius_km) * Number(reg.radius_km);
    }
    const gj = parseZoneGeoJson(reg.zone_geojson);
    if (gj) {
      if (gj.type === 'Polygon' && gj.coordinates[0]) return approxRingAreaKm2(gj.coordinates[0]);
      if (gj.type === 'MultiPolygon') {
        return gj.coordinates.reduce((sum, poly) => sum + (poly && poly[0] ? approxRingAreaKm2(poly[0]) : 0), 0);
      }
    }
    return 999999;
  }

  function parseZoneGeoJson(val) {
    if (!val) return null;
    if (typeof val === 'object') {
      if (val.type === 'FeatureCollection' && val.features && val.features[0]) return val.features[0].geometry;
      if (val.type === 'Feature') return val.geometry;
      return val;
    }
    if (typeof val === 'string') {
      try {
        return parseZoneGeoJson(JSON.parse(val));
      } catch (_) { return null; }
    }
    return null;
  }

  function isPointInRegion(lat, lng, reg) {
    if (!reg || lat == null || lng == null) return false;
    const nLat = Number(lat), nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
    if (reg.zone_type === 'circle' && reg.center_lat != null && reg.center_lng != null && Number(reg.radius_km) > 0) {
      return pointInCircle(nLat, nLng, Number(reg.center_lat), Number(reg.center_lng), Number(reg.radius_km));
    }
    const gj = parseZoneGeoJson(reg.zone_geojson);
    if (gj) return pointInGeoJson(nLat, nLng, gj);
    return false;
  }

  function findContainingRegion(lat, lng, SEED) {
    const regions = ((SEED && SEED.records && SEED.records.regions) || []);
    const matches = [];
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      if (!r || r.voided) continue;
      if (isPointInRegion(lat, lng, r)) {
        matches.push({ region: r.name, areaKm2: regionAreaKm2(r), row: r });
      }
    }
    matches.sort((a, b) => a.areaKm2 - b.areaKm2);
    return {
      best: matches[0] ? matches[0].region : '',
      name: matches[0] ? matches[0].region : '',
      matches: matches.map(m => m.region)
    };
  }

  // ==================== SEED HYDRATION & LIVE REGISTRY ENRICHMENT ====================
  function getCompanyHub(buName, SEED) {
    const canon = BU_LIST.find(b => norm(b) === norm(buName)) || buName || 'WTC';
    const base = DEFAULT_BU_HUBS[canon] || DEFAULT_BU_HUBS.WTC;
    const ov = GEO_STORE.companyHubs[norm(canon)] || GEO_STORE.companyHubs[canon];
    const lat = Number(ov && ov.lat != null ? ov.lat : base.lat);
    const lng = Number(ov && ov.lng != null ? ov.lng : base.lng);
    let region = (ov && ov.region) || base.region || '';
    if (SEED && SEED.records && SEED.records.regions) {
      const det = findContainingRegion(lat, lng, SEED);
      if (det.best) region = det.best;
    }
    return { name: canon, label: (ov && ov.label) || base.label || canon, lat, lng, region };
  }

  function getAllCompanyHubs(SEED) {
    return BU_LIST.map(bu => getCompanyHub(bu, SEED));
  }

  function setCompanyHubPin(buName, lat, lng, SEED, explicitRegion) {
    const canon = BU_LIST.find(b => norm(b) === norm(buName)) || buName || 'WTC';
    const nLat = round5(lat), nLng = round5(lng);
    const det = SEED ? findContainingRegion(nLat, nLng, SEED) : { best: '' };
    const region = explicitRegion || det.best || (DEFAULT_BU_HUBS[canon] && DEFAULT_BU_HUBS[canon].region) || '';
    GEO_STORE.companyHubs[norm(canon)] = {
      name: canon,
      label: (DEFAULT_BU_HUBS[canon] && DEFAULT_BU_HUBS[canon].label) || (canon + ' Plant / Hub'),
      lat: nLat,
      lng: nLng,
      region,
      updated_at: new Date().toISOString()
    };
    saveStoredConfig(true);
    return getCompanyHub(canon, SEED);
  }

  function hydrateSeedGeo(SEED, force = false) {
    if (!SEED || !SEED.records) return;
    const regions = SEED.records.regions || [];
    const sites = SEED.records.sites || [];
    const stamp = `${SEED._customRev || 0}:${regions.length}:${sites.length}:${GEO_STORE.updatedAt || ''}`;
    if (!force && SEED._geoHydratedStamp === stamp) return;

    // 1. Hydrate Regions with baseline OSM polygons / circles + user overrides
    const exactPolyByNorm = new Map();
    Object.keys(BASELINE_POLYGONS).forEach(k => exactPolyByNorm.set(norm(k), BASELINE_POLYGONS[k]));
    const exactCircByNorm = new Map();
    Object.keys(BASELINE_CIRCLES).forEach(k => exactCircByNorm.set(norm(k), BASELINE_CIRCLES[k]));

    regions.forEach(r => {
      if (!r || !r.name) return;
      const nk = norm(r.name);
      const ov = GEO_STORE.regions[nk];
      const basePoly = exactPolyByNorm.get(nk);
      const baseCirc = exactCircByNorm.get(nk);
      const base = baseCirc || basePoly;

      if (base && !r.zone_type) {
        r.zone_type = base.zone_type;
        r.center_lat = base.center_lat;
        r.center_lng = base.center_lng;
        if (base.radius_km != null) r.radius_km = base.radius_km;
        if (base.geojson) r.zone_geojson = base.geojson;
        if (base.distance_km != null && r.distance_km == null) r.distance_km = base.distance_km;
      }
      if (ov) {
        if (ov.zone_type) r.zone_type = ov.zone_type;
        if (ov.center_lat != null) r.center_lat = Number(ov.center_lat);
        if (ov.center_lng != null) r.center_lng = Number(ov.center_lng);
        if (ov.radius_km != null) r.radius_km = Number(ov.radius_km);
        if (ov.zone_geojson !== undefined) r.zone_geojson = ov.zone_geojson;
        if (ov.distance_km != null) r.distance_km = Number(ov.distance_km);
      }
    });

    // 2. Hydrate Sites with baseline pins + user overrides + automatic zone containment
    //    (Preserve historical SharePoint s.region on non-app seed rows so closed-month Driver OT parity stays $0.00;
    //     expose spatial zone membership via s.geo_zone across Map Studio, site search hints, and KM estimation.)
    sites.forEach(s => {
      if (!s || !s.name) return;
      const nk = norm(s.name);
      const ov = GEO_STORE.sites[nk];
      const basePin = BASELINE_SITE_PINS[nk];
      let geoZone = s.region || '';
      if (basePin) {
        if (s.latitude == null || s.latitude === '') s.latitude = basePin.lat;
        if (s.longitude == null || s.longitude === '') s.longitude = basePin.lng;
        if (!geoZone && basePin.region) geoZone = basePin.region;
      }
      if (ov) {
        if (ov.latitude != null) s.latitude = Number(ov.latitude);
        if (ov.longitude != null) s.longitude = Number(ov.longitude);
        if (ov.region) { s.region = ov.region; geoZone = ov.region; }
      }
      if (s.latitude != null && s.longitude != null && !geoZone) {
        const det = findContainingRegion(Number(s.latitude), Number(s.longitude), SEED);
        if (det.best) geoZone = det.best;
      }
      if (!s.region && s.source === 'app' && geoZone) {
        s.region = geoZone;
      }
      s.geo_zone = s.region || geoZone || '';
    });

    // 3. Stamp zone_shape & hub_km summaries on regions and sites for Universal Table visibility
    const wtcHub = getCompanyHub('WTC', SEED);
    regions.forEach(r => {
      if (!r) return;
      if (r.zone_type === 'circle' && Number(r.radius_km) > 0) {
        r.zone_shape = `Circle ${round1(r.radius_km)} km`;
      } else if (r.zone_type === 'polygon' && r.zone_geojson) {
        r.zone_shape = 'Polygon Zone';
      } else {
        r.zone_shape = 'Unmapped';
      }
      if (r.distance_km == null && r.center_lat != null && r.center_lng != null) {
        r.distance_km = round1(roadAdjustedKm(wtcHub.lat, wtcHub.lng, Number(r.center_lat), Number(r.center_lng)));
      }
    });
    SEED._geoHydratedStamp = stamp;
  }

  // ==================== ROAD DISTANCE (KM) ESTIMATION ENGINE (RULE A4) ====================
  function roadAdjustedKm(lat1, lng1, lat2, lng2) {
    const air = haversineKm(lat1, lng1, lat2, lng2);
    if (air < 0.05) return 0;
    // Lebanon coastal highway (A51/M51) averages ~1.29x air distance; Mount Lebanon / Bekaa switchbacks ~1.42x
    const maxLng = Math.max(Number(lng1), Number(lng2));
    const factor = maxLng > 35.57 ? 1.41 : 1.30;
    return round1(air * factor);
  }

  function makePairKey(aType, aName, bType, bName) {
    const left = `${aType}:${norm(aName)}`;
    const right = `${bType}:${norm(bName)}`;
    return left <= right ? `${left}||${right}` : `${right}||${left}`;
  }

  function resolveEndpointCoord(spec, SEED) {
    if (!spec || !spec.name) return null;
    const kind = spec.type === 'bu' ? 'bu' : 'site';
    if (kind === 'bu') {
      const hub = getCompanyHub(spec.name, SEED);
      return { lat: hub.lat, lng: hub.lng, pinned: true, label: hub.name, region: hub.region, type: 'bu' };
    }
    const nk = norm(spec.name);
    const sites = (SEED && SEED.records && SEED.records.sites) || [];
    const sRow = sites.find(s => s && norm(s.name) === nk);
    const ov = GEO_STORE.sites[nk];
    const basePin = BASELINE_SITE_PINS[nk];
    const lat = ov && ov.latitude != null ? Number(ov.latitude) : (sRow && sRow.latitude != null && sRow.latitude !== '' ? Number(sRow.latitude) : (basePin ? basePin.lat : null));
    const lng = ov && ov.longitude != null ? Number(ov.longitude) : (sRow && sRow.longitude != null && sRow.longitude !== '' ? Number(sRow.longitude) : (basePin ? basePin.lng : null));
    const regName = (ov && ov.region) || (sRow && sRow.region) || (basePin && basePin.region) || '';
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, pinned: true, label: spec.name, region: regName, type: 'site' };
    }
    if (regName && SEED && SEED.records && SEED.records.regions) {
      const rRow = SEED.records.regions.find(r => r && norm(r.name) === norm(regName));
      if (rRow && rRow.center_lat != null && rRow.center_lng != null) {
        return { lat: Number(rRow.center_lat), lng: Number(rRow.center_lng), pinned: false, fromRegionCenter: true, label: spec.name, region: regName, distanceKmFallback: rRow.distance_km, type: 'site' };
      }
      if (rRow && Number(rRow.distance_km) > 0) {
        return { lat: null, lng: null, pinned: false, region: regName, distanceKmFallback: Number(rRow.distance_km), label: spec.name, type: 'site' };
      }
    }
    // Check if site name matches a BU name (e.g. 'Wtc')
    const matchBu = BU_LIST.find(b => norm(b) === nk);
    if (matchBu) {
      const hub = getCompanyHub(matchBu, SEED);
      return { lat: hub.lat, lng: hub.lng, pinned: true, label: spec.name, region: hub.region, type: 'site' };
    }
    return null;
  }

  const _osrmInflight = new Map();
  function maybeFetchOsrmRoute(pairKey, c1, c2, onUpdate) {
    if (!c1 || !c2 || c1.lat == null || c2.lat == null) return;
    if (navigator.webdriver || window.__MFG_HEADLESS_TEST || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    if (GEO_STORE.routeKmCache[pairKey] || _osrmInflight.has(pairKey)) return;
    const url = `https://router.project-osrm.org/route/v1/driving/${c1.lng},${c1.lat};${c2.lng},${c2.lat}?overview=simplified&geometries=geojson`;
    const p = fetch(url).then(r => r.ok ? r.json() : null).then(data => {
      _osrmInflight.delete(pairKey);
      if (data && data.routes && data.routes[0] && Number(data.routes[0].distance) >= 0) {
        const km = round1(Number(data.routes[0].distance) / 1000);
        const mins = Math.max(1, Math.round(Number(data.routes[0].duration || 0) / 60));
        const coords = (data.routes[0].geometry && data.routes[0].geometry.coordinates) || null;
        GEO_STORE.routeKmCache[pairKey] = { km, mins, coords, ts: Date.now() };
        saveStoredConfig(false);
        if (typeof onUpdate === 'function') onUpdate(GEO_STORE.routeKmCache[pairKey]);
      }
    }).catch(() => { _osrmInflight.delete(pairKey); });
    _osrmInflight.set(pairKey, p);
  }

  function estimateLegKm(fromSpec, toSpec, SEED, opts = {}) {
    if (!fromSpec || !toSpec || !fromSpec.name || !toSpec.name) return null;
    const fromIsBu = fromSpec.type === 'bu';
    const anyBu = fromSpec.type === 'bu' || toSpec.type === 'bu';
    const showRoundTrip = opts.roundTripIfAnyBu ? anyBu : fromIsBu;
    const pairKey = makePairKey(fromSpec.type || 'site', fromSpec.name, toSpec.type || 'site', toSpec.name);

    const c1 = resolveEndpointCoord(fromSpec, SEED);
    const c2 = resolveEndpointCoord(toSpec, SEED);

    let oneWayKm = null;
    let source = '';
    let routeCoords = null;
    let estMinutes = null;

    if (norm(fromSpec.name) === norm(toSpec.name) && (fromSpec.type || 'site') === (toSpec.type || 'site')) {
      oneWayKm = 0;
      source = 'Same location';
      estMinutes = 0;
    } else if (GEO_STORE.pairKmOverrides[pairKey] != null && Number(GEO_STORE.pairKmOverrides[pairKey]) >= 0) {
      oneWayKm = round1(Number(GEO_STORE.pairKmOverrides[pairKey]));
      source = 'Saved custom KM';
    } else if (GEO_STORE.routeKmCache[pairKey] && GEO_STORE.routeKmCache[pairKey].km != null) {
      oneWayKm = round1(GEO_STORE.routeKmCache[pairKey].km);
      estMinutes = GEO_STORE.routeKmCache[pairKey].mins || null;
      routeCoords = GEO_STORE.routeKmCache[pairKey].coords || null;
      source = 'Road route';
    } else if (c1 && c2 && c1.lat != null && c2.lat != null) {
      oneWayKm = roadAdjustedKm(c1.lat, c1.lng, c2.lat, c2.lng);
      source = (c1.fromRegionCenter || c2.fromRegionCenter) ? 'Region zone estimate' : 'Map road estimate';
      if (opts.onAsyncRoute) maybeFetchOsrmRoute(pairKey, c1, c2, opts.onAsyncRoute);
    } else if (anyBu && ((c1 && c1.distanceKmFallback > 0) || (c2 && c2.distanceKmFallback > 0))) {
      oneWayKm = round1((c1 && c1.distanceKmFallback) || (c2 && c2.distanceKmFallback));
      source = 'Region reference KM';
    }

    if (oneWayKm == null) {
      return {
        available: false,
        pairKey,
        fromCoord: c1,
        toCoord: c2,
        isBuOrigin: fromIsBu,
        showRoundTrip
      };
    }

    const roundTripKm = showRoundTrip ? round1(oneWayKm * 2) : null;
    if (estMinutes == null) estMinutes = oneWayKm > 0 ? Math.max(2, Math.round((oneWayKm / 38) * 60)) : 0;
    const basisKmForFuel = roundTripKm != null ? roundTripKm : oneWayKm;
    const estDieselL = round1(basisKmForFuel * 0.42);

    return {
      available: true,
      oneWayKm,
      roundTripKm,
      isBuOrigin: fromIsBu,
      showRoundTrip,
      source,
      estMinutes,
      estDieselL,
      pairKey,
      fromCoord: c1,
      toCoord: c2,
      routeCoords
    };
  }

  function setPairKmOverride(fromSpec, toSpec, kmVal) {
    const pairKey = makePairKey(fromSpec.type || 'site', fromSpec.name, toSpec.type || 'site', toSpec.name);
    if (kmVal == null || kmVal === '' || !Number.isFinite(Number(kmVal)) || Number(kmVal) < 0) {
      delete GEO_STORE.pairKmOverrides[pairKey];
    } else {
      GEO_STORE.pairKmOverrides[pairKey] = round1(Number(kmVal));
    }
    saveStoredConfig(true);
    return pairKey;
  }

  // ==================== UNIFIED RAW + SALES SITE & 24H TICKET CHAINING ENGINE ====================
  let _siteStatsCache = { rev: '', list: [], byNorm: new Map() };

  function getUnifiedSiteStats(SEED, STATE) {
    const rec = (SEED && SEED.records) || {};
    const cr = (STATE && STATE.customRecords) || {};
    const rev = `${(rec.sites || []).length}:${(rec.sales_tickets || []).length}:${(rec.raw_purchases || []).length}:${(cr.sales_tickets || []).length}:${(cr.raw_purchases || []).length}:${(cr.sites || []).length}:${GEO_STORE.updatedAt || ''}`;
    if (_siteStatsCache.rev === rev) return _siteStatsCache;

    const map = new Map();
    const ensure = name => {
      const clean = String(name || '').trim();
      const nk = norm(clean);
      if (!nk) return null;
      if (!map.has(nk)) {
        map.set(nk, { name: clean, sales: 0, raw: 0, total: 0, region: '', lat: null, lng: null, isJv: false });
      }
      return map.get(nk);
    };

    const allSites = (cr.sites || []).concat(rec.sites || []);
    allSites.forEach(s => {
      if (!s || s.voided || !s.name) return;
      const e = ensure(s.name);
      if (!e) return;
      const effReg = s.region || s.geo_zone || '';
      if (effReg && !e.region) e.region = effReg;
      if (s.latitude != null && s.latitude !== '' && e.lat == null) e.lat = Number(s.latitude);
      if (s.longitude != null && s.longitude !== '' && e.lng == null) e.lng = Number(s.longitude);
      if (s.is_jv) e.isJv = true;
    });

    const seenSales = new Set();
    (cr.sales_tickets || []).concat(rec.sales_tickets || []).forEach(t => {
      if (!t || t.voided || !t.site) return;
      if (t.id && seenSales.has(t.id)) return;
      if (t.id) seenSales.add(t.id);
      const e = ensure(t.site);
      if (e) { e.sales += 1; e.total += 1; }
    });

    const seenRaw = new Set();
    (cr.raw_purchases || []).concat(rec.raw_purchases || []).forEach(t => {
      if (!t || t.voided || !t.site) return;
      if (t.id && seenRaw.has(t.id)) return;
      if (t.id) seenRaw.add(t.id);
      const e = ensure(t.site);
      if (e) { e.raw += 1; e.total += 1; }
    });

    const list = Array.from(map.values()).sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name));
    _siteStatsCache = { rev, list, byNorm: map };
    return _siteStatsCache;
  }

  function parseTicketTimestampMs(dateIso, timeStr, fallbackNoon = true) {
    const d = String(dateIso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const tm = String(timeStr || '').trim();
    const m = tm.match(/^(\d{1,2}):(\d{2})/);
    const hh = m ? Math.min(23, Math.max(0, parseInt(m[1], 10))) : (fallbackNoon ? 12 : 0);
    const mm = m ? Math.min(59, Math.max(0, parseInt(m[2], 10))) : 0;
    const [Y, M, D] = d.split('-').map(Number);
    return Date.UTC(Y, M - 1, D, hh, mm, 0);
  }

  function formatAgeShort(hours) {
    if (!(hours >= 0)) return 'just now';
    if (hours < 1) {
      const mins = Math.max(1, Math.round(hours * 60));
      return `${mins}m ago`;
    }
    return `${round1(hours)}h ago`;
  }

  function collectAllRecentTickets24h(SEED, STATE, opts = {}) {
    const rec = (SEED && SEED.records) || {};
    const cr = (STATE && STATE.customRecords) || {};
    const refDate = String(opts.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const refTime = String(opts.time || '23:59').trim() || '23:59';
    const refMs = parseTicketTimestampMs(refDate, refTime, true);
    if (refMs == null) return [];

    const siteFilterNorm = opts.site ? norm(opts.site) : '';
    const prefTruckNorm = opts.truck ? norm(opts.truck) : '';
    const excludeId = opts.excludeId ? String(opts.excludeId) : '';
    const out = [];

    const scanPool = (rows, kind) => {
      const seen = new Set();
      for (let i = 0; i < rows.length; i++) {
        const t = rows[i];
        if (!t || t.voided) continue;
        if (t.id) {
          if (String(t.id) === excludeId || seen.has(t.id)) continue;
          seen.add(t.id);
        }
        const mth = String(t.method || '');
        if (/return/i.test(mth)) continue;
        if (!t.ticket_no && !t.name) continue;
        const tSite = String(t.site || '').trim();
        if (siteFilterNorm && norm(tSite) !== siteFilterNorm) continue;

        const dStr = String(t.rep_date || t.date || '').slice(0, 10);
        if (!dStr) continue;
        // Fast date pre-filter before timestamp math (at most 2 calendar days apart)
        const tMs = parseTicketTimestampMs(dStr, t.time || '12:00', true);
        if (tMs == null) continue;
        const deltaHours = (refMs - tMs) / 3600000;
        if (deltaHours < -0.5 || deltaHours > 24.0) continue;

        const tNo = String(t.ticket_no || t.name || '').trim();
        const truckMatch = Boolean(prefTruckNorm && t.truck && norm(t.truck) === prefTruckNorm);
        const party = kind === 'sales' ? (t.customer || '') : (t.site_owner || t.truck_owner || '');
        const qtyStr = Number(t.qty || 0) > 0 ? `${round2(t.qty)} ${t.uom || 'm³'}` : '';
        const kindTag = kind === 'sales' ? 'SALES' : 'RAW';
        const ageLbl = formatAgeShort(Math.max(0, deltaHours));
        const metaParts = [kindTag, ageLbl];
        if (t.company) metaParts.push(t.company);
        if (t.truck) metaParts.push(`Truck ${t.truck}`);
        if (t.product) metaParts.push(qtyStr ? `${t.product} (${qtyStr})` : t.product);
        if (party) metaParts.push(party);

        out.push({
          id: t.id || `${kind}_${tNo}_${dStr}`,
          kind,
          kindLabel: kindTag,
          ticket_no: tNo,
          company: t.company || 'WTC',
          date: dStr,
          time: t.time || '12:00',
          deltaHours: Math.max(0, deltaHours),
          ageLabel: ageLbl,
          site: tSite,
          truck: t.truck || '',
          driver: t.driver || '',
          truck_owner: t.truck_owner || '',
          transport_by: t.transport_by || '',
          product: t.product || '',
          qty: Number(t.qty || 0),
          uom: t.uom || 'm³',
          customer: t.customer || '',
          site_owner: t.site_owner || '',
          unit_price: Number(t.unit_price || t.unit_cost || 0),
          total: Number(t.total || 0),
          total_ttc: Number(t.total_ttc != null ? t.total_ttc : (t.total || 0)),
          method: t.method || 'Credit',
          truckMatch,
          metaLabel: metaParts.join(' · '),
          rawRow: t
        });
      }
    };

    scanPool((cr.sales_tickets || []).concat(rec.sales_tickets || []), 'sales');
    scanPool((cr.raw_purchases || []).concat(rec.raw_purchases || []), 'raw');

    out.sort((a, b) => {
      if (a.truckMatch !== b.truckMatch) return a.truckMatch ? -1 : 1;
      return a.deltaHours - b.deltaHours;
    });
    return out;
  }

  function getSiteLast24hTickets(SEED, STATE, opts = {}) {
    if (!opts || !opts.site) return [];
    return collectAllRecentTickets24h(SEED, STATE, opts);
  }

  function getUnifiedSiteMetaItems(SEED, STATE, opts = {}) {
    const stats = getUnifiedSiteStats(SEED, STATE);
    const side = opts.side || 'both';
    const truck = String(opts.truck || '').trim();
    let truckRecentSiteMap = new Map();
    if (truck) {
      const recentForTruck = collectAllRecentTickets24h(SEED, STATE, {
        date: opts.date,
        time: opts.time,
        truck
      });
      recentForTruck.forEach(rt => {
        const nk = norm(rt.site);
        if (nk && !truckRecentSiteMap.has(nk)) truckRecentSiteMap.set(nk, rt);
      });
    }

    const rows = stats.list.slice();
    rows.sort((a, b) => {
      const aHit = truckRecentSiteMap.has(norm(a.name));
      const bHit = truckRecentSiteMap.has(norm(b.name));
      if (aHit !== bHit) return aHit ? -1 : 1;
      const aScore = side === 'raw' ? (a.raw * 100000 + a.total) : (side === 'sales' ? (a.sales * 100000 + a.total) : a.total);
      const bScore = side === 'raw' ? (b.raw * 100000 + b.total) : (side === 'sales' ? (b.sales * 100000 + b.total) : b.total);
      return (bScore - aScore) || a.name.localeCompare(b.name);
    });

    return rows.map(s => {
      const parts = [];
      const trkHit = truckRecentSiteMap.get(norm(s.name));
      if (trkHit) parts.push(`Truck ${truck} stop (${trkHit.kindLabel} #${trkHit.ticket_no} · ${trkHit.ageLabel})`);
      if (s.raw > 0 && s.sales > 0) parts.push(`${s.raw} Raw · ${s.sales} Sales`);
      else if (s.raw > 0) parts.push(`${s.raw} Raw loads`);
      else if (s.sales > 0) parts.push(`${s.sales} Sales loads`);
      else parts.push('Registered site');
      if (s.region) parts.push(s.region);
      return [s.name, parts.join(' · ')];
    });
  }

  // ==================== LAZY LOCAL LEAFLET LOADER ====================
  let _leafletPromise = null;
  function ensureLeaflet() {
    if (window.L && typeof window.L.map === 'function') return Promise.resolve(window.L);
    if (_leafletPromise) return _leafletPromise;
    _leafletPromise = new Promise((resolve, reject) => {
      if (!document.getElementById('mfgLeafletCss')) {
        const lk = document.createElement('link');
        lk.id = 'mfgLeafletCss';
        lk.rel = 'stylesheet';
        lk.href = 'vendor/leaflet/leaflet.css';
        document.head.appendChild(lk);
      }
      const sc = document.createElement('script');
      sc.src = 'vendor/leaflet/leaflet.js';
      sc.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet missing'));
      sc.onerror = () => { _leafletPromise = null; reject(new Error('Leaflet load error')); };
      document.head.appendChild(sc);
    });
    return _leafletPromise;
  }

  function parsePastedCoordinates(rawText) {
    const s = String(rawText || '').trim();
    if (!s) return null;
    // Match @33.8938,35.4820 or ?q=33.8938,35.4820 or plain "33.8938, 35.4820"
    const m = s.match(/(-?\d{1,2}\.\d{3,8})\s*[,;/\s]\s*(-?\d{1,3}\.\d{3,8})/);
    if (!m) return null;
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: round5(lat), lng: round5(lng) };
  }

  function addBaseTiles(L, map) {
    if (navigator.webdriver || window.__MFG_HEADLESS_TEST) {
      // Deterministic zero-network subtle cartographic grid in headless verification
      const GridLayer = L.GridLayer.extend({
        createTile: function () {
          const tile = document.createElement('canvas');
          tile.width = 256; tile.height = 256;
          const g = tile.getContext('2d');
          const dark = document.documentElement.getAttribute('data-theme') === 'dark';
          g.fillStyle = dark ? '#0F1B33' : '#EAECEF';
          g.fillRect(0, 0, 256, 256);
          g.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(8,17,36,0.06)';
          g.lineWidth = 1;
          for (let x = 0; x <= 256; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
          for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
          return tile;
        }
      });
      new GridLayer().addTo(map);
      return;
    }
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
  }

  function makeSvgPinIcon(L, color, label, isBu) {
    const svg = isBu
      ? `<svg width="26" height="30" viewBox="0 0 26 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 1C6.925 1 2 5.925 2 12c0 7.75 11 17 11 17s11-9.25 11-17c0-6.075-4.925-11-11-11z" fill="#081124" stroke="#D9A54A" stroke-width="2"/><rect x="8.5" y="7.5" width="9" height="9" rx="1.5" fill="#D9A54A"/></svg>`
      : `<svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 1C5.03 1 1 5.03 1 10c0 6.2 9 13 9 13s9-6.8 9-13c0-4.97-4.03-9-9-9z" fill="${color}" stroke="#FFFFFF" stroke-width="1.6"/><circle cx="10" cy="10" r="3.2" fill="#FFFFFF"/></svg>`;
    const showLbl = Boolean(label);
    return L.divIcon({
      className: 'geo-pin-marker',
      iconSize: isBu ? [26, 36] : [20, 30],
      iconAnchor: isBu ? [13, 28] : [10, 23],
      popupAnchor: [0, -22],
      html: `<div class="geo-pin-svg-wrap">${svg}${showLbl ? `<span class="geo-pin-lbl${isBu ? ' is-bu' : ''}">${esc(label)}</span>` : ''}</div>`
    });
  }

  // ==================== INTERACTIVE SPLIT-SCREEN MAP STUDIO (#geoMapStudioDeck) ====================
  const STUDIO = {
    collapsed: false,
    mode: 'view',         // 'view' | 'circle' | 'polygon' | 'pin'
    selectedRegion: '',   // '' = All Regions overview
    regionSearch: '',
    pinFilter: 'all',     // 'all' | 'bu' | 'raw' | 'sales' | 'dual'
    distFrom: 'bu:WTC',
    distTo: 'site:Choueifat',
    drawRegionName: '',
    circleCenter: null,   // { lat, lng }
    circleRadiusKm: 1.5,
    polyPoints: [],       // [[lng, lat], ...]
    pinTargetType: 'site',// 'site' | 'bu'
    pinTargetName: '',
    pinLat: null,
    pinLng: null,
    pinRegion: '',
    map: null,
    layers: null
  };

  function renderGeoStudioHtml(ctx) {
    const SEED = ctx.SEED;
    const STATE = ctx.STATE;
    hydrateSeedGeo(SEED);
    const regions = ((SEED && SEED.records && SEED.records.regions) || []).filter(r => r && !r.voided);
    const siteStats = getUnifiedSiteStats(SEED, STATE);
    const hubs = getAllCompanyHubs(SEED);

    const mappedRegionsCnt = regions.filter(r => (r.zone_type === 'circle' && r.radius_km > 0) || (r.zone_type === 'polygon' && r.zone_geojson)).length;
    const pinnedSitesCnt = ((SEED && SEED.records && SEED.records.sites) || []).filter(s => s && !s.voided && s.latitude != null && s.longitude != null).length;

    // Count sites and BUs per region (including spatial containment!)
    const sitesByReg = new Map();
    ((SEED && SEED.records && SEED.records.sites) || []).forEach(s => {
      if (!s || s.voided) return;
      const rk = norm(s.region || s.geo_zone);
      if (rk) sitesByReg.set(rk, (sitesByReg.get(rk) || 0) + 1);
    });
    const busByReg = new Map();
    hubs.forEach(h => {
      const rk = norm(h.region);
      if (rk) {
        if (!busByReg.has(rk)) busByReg.set(rk, []);
        busByReg.get(rk).push(h.name);
      }
    });

    const otByReg = new Map();
    ((SEED && SEED.records && SEED.records.overtime_rates) || []).forEach(o => {
      if (o && !o.voided && o.region && Number(o.amount) > 0) {
        const rk = norm(o.region);
        if (!otByReg.has(rk)) otByReg.set(rk, Number(o.amount));
      }
    });

    const q = norm(STUDIO.regionSearch);
    const sortedRegions = regions.slice().sort((a, b) => {
      const aBu = (busByReg.get(norm(a.name)) || []).length;
      const bBu = (busByReg.get(norm(b.name)) || []).length;
      if (aBu !== bBu) return bBu - aBu;
      const aCnt = sitesByReg.get(norm(a.name)) || 0;
      const bCnt = sitesByReg.get(norm(b.name)) || 0;
      if (aCnt !== bCnt) return bCnt - aCnt;
      return String(a.name || '').localeCompare(String(b.name || ''));
    }).filter(r => !q || norm(r.name).includes(q) || (busByReg.get(norm(r.name)) || []).some(b => norm(b).includes(q)));

    // Build distance endpoint options
    const distOptionsHtml = (selectedVal) => {
      const buOpts = hubs.map(h => {
        const v = `bu:${h.name}`;
        return `<option value="${esc(v)}"${v === selectedVal ? ' selected' : ''}>Company BU: ${esc(h.name)} (${esc(h.region || 'Hub')})</option>`;
      }).join('');
      const siteOpts = siteStats.list.slice(0, 140).map(s => {
        const v = `site:${s.name}`;
        return `<option value="${esc(v)}"${v === selectedVal ? ' selected' : ''}>Site: ${esc(s.name)}${s.region ? ' (' + esc(s.region) + ')' : ''}</option>`;
      }).join('');
      return `<optgroup label="Company Business Units">${buOpts}</optgroup><optgroup label="Operational Sites (Raw &amp; Sales)">${siteOpts}</optgroup>`;
    };

    const parseSpec = raw => {
      const s = String(raw || '');
      const idx = s.indexOf(':');
      return idx > 0 ? { type: s.slice(0, idx), name: s.slice(idx + 1) } : { type: 'site', name: s };
    };
    const fromSpec = parseSpec(STUDIO.distFrom);
    const toSpec = parseSpec(STUDIO.distTo);
    const kmEst = estimateLegKm(fromSpec, toSpec, SEED, { roundTripIfAnyBu: true });
    const hasOverride = GEO_STORE.pairKmOverrides[kmEst ? kmEst.pairKey : ''] != null;

    const selRegObj = STUDIO.selectedRegion
      ? regions.find(r => norm(r.name) === norm(STUDIO.selectedRegion))
      : null;

    let toolDrawerHtml = '';
    if (!STUDIO.collapsed && STUDIO.mode === 'circle') {
      const rPresets = [0.8, 1.5, 3, 5, 10, 15];
      let liveInsideSites = 0;
      if (STUDIO.circleCenter) {
        const radKm = Math.max(0.2, Number(STUDIO.circleRadiusKm || 1.5));
        ((SEED && SEED.records && SEED.records.sites) || []).forEach(s => {
          if (s && !s.voided && s.latitude != null && s.longitude != null && pointInCircle(Number(s.latitude), Number(s.longitude), STUDIO.circleCenter.lat, STUDIO.circleCenter.lng, radKm)) {
            liveInsideSites++;
          }
        });
      }
      toolDrawerHtml = `
        <div class="geo-tool-drawer" id="geoToolDrawer">
          <div class="geo-tool-fields">
            <label class="geo-tool-field">Region Name
              <input type="text" id="geoDrawRegionInp" list="dl_geo_draw_regions" value="${esc(STUDIO.drawRegionName || STUDIO.selectedRegion)}" placeholder="Select or type new region...">
              <datalist id="dl_geo_draw_regions">${regions.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist>
            </label>
            <label class="geo-tool-field">Radius (km)
              <input type="number" id="geoCircleRadiusInp" step="0.1" min="0.2" max="50" value="${esc(STUDIO.circleRadiusKm)}" style="width:68px">
              <input type="range" id="geoCircleRadiusSlider" class="geo-radius-slider" min="0.3" max="25" step="0.1" value="${esc(Math.min(25, Math.max(0.3, Number(STUDIO.circleRadiusKm || 1.5))))}" aria-label="Circle Radius Slider">
            </label>
            <div class="geo-radius-pills">
              ${rPresets.map(rk => `<button type="button" class="geo-r-pill${Number(STUDIO.circleRadiusKm) === rk ? ' active' : ''}" data-geo-radius-preset="${rk}">${rk} km</button>`).join('')}
            </div>
            <span class="geo-live-inside-pill" id="geoLiveInsideCountPill"${STUDIO.circleCenter ? '' : ' hidden'}>${liveInsideSites} ${liveInsideSites === 1 ? 'Site' : 'Sites'} inside</span>
            <span class="geo-tool-hint" id="geoDraftCoordsLbl">${STUDIO.circleCenter ? `Center: ${STUDIO.circleCenter.lat}, ${STUDIO.circleCenter.lng}` : 'Click anywhere on the map to place circle center'}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button type="button" class="btn btn-primary" id="geoSaveZoneBtn">Save Circle Zone</button>
            <button type="button" class="geo-collapse-btn" data-geo-mode="view">Cancel</button>
          </div>
        </div>
      `;
    } else if (!STUDIO.collapsed && STUDIO.mode === 'polygon') {
      toolDrawerHtml = `
        <div class="geo-tool-drawer" id="geoToolDrawer">
          <div class="geo-tool-fields">
            <label class="geo-tool-field">Region Name
              <input type="text" id="geoDrawRegionInp" list="dl_geo_draw_regions" value="${esc(STUDIO.drawRegionName || STUDIO.selectedRegion)}" placeholder="Select or type new region...">
              <datalist id="dl_geo_draw_regions">${regions.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist>
            </label>
            <span class="geo-tool-hint" id="geoPolyPtsLbl">Vertices: <b>${STUDIO.polyPoints.length}</b> (click 3+ points on map to outline zone)</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <button type="button" class="geo-collapse-btn" id="geoUndoPtBtn">Undo Point</button>
            <button type="button" class="geo-collapse-btn" id="geoClearPtsBtn">Clear</button>
            <button type="button" class="btn btn-primary" id="geoSaveZoneBtn">Save Polygon Zone</button>
            <button type="button" class="geo-collapse-btn" data-geo-mode="view">Cancel</button>
          </div>
        </div>
      `;
    } else if (!STUDIO.collapsed && STUDIO.mode === 'pin') {
      const isBuPin = STUDIO.pinTargetType === 'bu';
      toolDrawerHtml = `
        <div class="geo-tool-drawer" id="geoToolDrawer">
          <div class="geo-tool-fields">
            <label class="geo-tool-field">Pin Type
              <select id="geoPinTypeSel">
                <option value="site"${!isBuPin ? ' selected' : ''}>Operational Site</option>
                <option value="bu"${isBuPin ? ' selected' : ''}>Company BU Hub</option>
              </select>
            </label>
            ${isBuPin ? `
              <label class="geo-tool-field">Company BU
                <select id="geoPinBuSel">
                  ${BU_LIST.map(b => `<option value="${esc(b)}"${STUDIO.pinTargetName === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}
                </select>
              </label>
            ` : `
              <label class="geo-tool-field">Site
                <input type="text" id="geoPinSiteInp" list="dl_geo_pin_sites" value="${esc(STUDIO.pinTargetName)}" placeholder="Search or type site...">
                <datalist id="dl_geo_pin_sites">${siteStats.list.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
              </label>
            `}
            <label class="geo-tool-field">Coords / Link
              <input type="text" id="geoPinCoordPasteInp" value="${STUDIO.pinLat != null && STUDIO.pinLng != null ? `${STUDIO.pinLat}, ${STUDIO.pinLng}` : ''}" placeholder="Click map or paste lat, lng" style="width:168px">
            </label>
            <label class="geo-tool-field">Zone
              <input type="text" id="geoPinRegionInp" list="dl_geo_draw_regions" value="${esc(STUDIO.pinRegion)}" placeholder="Auto from map zone" style="width:136px">
              <datalist id="dl_geo_draw_regions">${regions.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist>
            </label>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button type="button" class="btn btn-primary" id="geoSavePinBtn">Save Location Pin</button>
            <button type="button" class="geo-collapse-btn" data-geo-mode="view">Cancel</button>
          </div>
        </div>
      `;
    }

    return `
      <section class="geo-studio-deck" id="geoMapStudioDeck" aria-label="Regions, Zones and Site Distance Map Studio">
        <div class="geo-studio-topbar">
          <div class="geo-studio-title-grp">
            <h3 class="geo-studio-title">Interactive Regions, Zones &amp; KM Studio</h3>
            <div class="geo-studio-kpis">
              <span class="geo-kpi-pill is-bu">3 Company BUs Mapped (${hubs.map(h => `${esc(h.name)}: ${esc(h.region)}`).join(' · ')})</span>
              <span class="geo-kpi-pill">${mappedRegionsCnt}/${regions.length} Region Zones</span>
              <span class="geo-kpi-pill">${pinnedSitesCnt} Pinned Sites</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${!STUDIO.collapsed ? `
              <div class="geo-mode-group" id="geoModeBar" role="group" aria-label="Map Studio Mode">
                <button type="button" class="geo-mode-btn${STUDIO.mode === 'view' ? ' active' : ''}" data-geo-mode="view">View Zones</button>
                <button type="button" class="geo-mode-btn${STUDIO.mode === 'circle' ? ' active' : ''}" data-geo-mode="circle">+ Circle Zone</button>
                <button type="button" class="geo-mode-btn${STUDIO.mode === 'polygon' ? ' active' : ''}" data-geo-mode="polygon">+ Polygon Zone</button>
                <button type="button" class="geo-mode-btn${STUDIO.mode === 'pin' ? ' active' : ''}" data-geo-mode="pin">Pin Site / Company</button>
              </div>
            ` : ''}
            <button type="button" class="geo-collapse-btn" id="geoToggleCollapseBtn">${STUDIO.collapsed ? 'Show Map Studio' : 'Hide Map'}</button>
          </div>
        </div>

        ${toolDrawerHtml}

        ${!STUDIO.collapsed ? `
          <div class="geo-studio-body">
            <aside class="geo-regions-rail" id="geoRegionsRail">
              <div class="geo-rail-head">
                <input type="search" class="geo-rail-search" id="geoRegionSearch" value="${esc(STUDIO.regionSearch)}" placeholder="Filter regions or Company BU...">
                <div class="geo-bu-quick-row">
                  ${hubs.map(h => `<button type="button" class="geo-bu-chip${norm(STUDIO.selectedRegion) === norm(h.region) ? ' active' : ''}" data-geo-jump-bu="${esc(h.name)}">${esc(h.name)} · ${esc(h.region)}</button>`).join('')}
                </div>
              </div>
              <div class="geo-regions-list" id="geoRegionsList">
                <button type="button" class="geo-reg-card${!STUDIO.selectedRegion ? ' active' : ''}" data-geo-region="">
                  <div class="geo-reg-card-top">
                    <span class="geo-reg-name">All Lebanon Zones (Overview)</span>
                    <span class="geo-reg-shape is-poly">${mappedRegionsCnt} Zones</span>
                  </div>
                  <div class="geo-reg-card-sub">
                    <span>Click any region below to zoom &amp; inspect</span>
                  </div>
                </button>
                ${sortedRegions.map(r => {
                  const rk = norm(r.name);
                  const isAct = norm(STUDIO.selectedRegion) === rk;
                  const sCnt = sitesByReg.get(rk) || 0;
                  const buHits = busByReg.get(rk) || [];
                  const otRate = otByReg.get(rk) || r.driver_ot_rate || null;
                  const isCirc = r.zone_type === 'circle' && Number(r.radius_km) > 0;
                  const isPoly = r.zone_type === 'polygon' && Boolean(r.zone_geojson);
                  const shapeCls = isCirc ? 'is-circle' : (isPoly ? 'is-poly' : 'is-none');
                  const shapeTxt = isCirc ? `Circle ${round1(r.radius_km)} km` : (isPoly ? 'Zone' : 'Set Zone');
                  return `
                    <button type="button" class="geo-reg-card${isAct ? ' active' : ''}" data-geo-region="${esc(r.name)}">
                      <div class="geo-reg-card-top">
                        <span class="geo-reg-name">${esc(r.name)}</span>
                        <span class="geo-reg-shape ${shapeCls}">${esc(shapeTxt)}</span>
                      </div>
                      <div class="geo-reg-card-sub">
                        ${buHits.map(b => `<span class="geo-reg-bu-tag">${esc(b)}</span>`).join('')}
                        <span>${sCnt} ${sCnt === 1 ? 'Site' : 'Sites'}</span>
                        ${otRate ? `<span>OT $${round2(otRate)}</span>` : ''}
                      </div>
                    </button>
                  `;
                }).join('')}
              </div>
            </aside>

            <div class="geo-map-stage">
              <div class="geo-map-filter-strip" id="geoPinFilterStrip">
                <div class="geo-pin-filters">
                  <button type="button" class="geo-pin-chip${STUDIO.pinFilter === 'all' ? ' active' : ''}" data-geo-pin-filter="all">All Pins</button>
                  <button type="button" class="geo-pin-chip${STUDIO.pinFilter === 'bu' ? ' active' : ''}" data-geo-pin-filter="bu"><span class="geo-dot bu"></span>Company BUs (3)</button>
                  <button type="button" class="geo-pin-chip${STUDIO.pinFilter === 'dual' ? ' active' : ''}" data-geo-pin-filter="dual"><span class="geo-dot dual"></span>Dual Raw+Sales</button>
                  <button type="button" class="geo-pin-chip${STUDIO.pinFilter === 'raw' ? ' active' : ''}" data-geo-pin-filter="raw"><span class="geo-dot raw"></span>Raw / Quarry</button>
                  <button type="button" class="geo-pin-chip${STUDIO.pinFilter === 'sales' ? ' active' : ''}" data-geo-pin-filter="sales"><span class="geo-dot sales"></span>Sales Delivery</button>
                </div>
                <button type="button" class="geo-mini-btn" id="geoResetLebanonViewBtn">Reset Lebanon View</button>
              </div>

              ${selRegObj ? `
                <div class="geo-focus-card" id="geoFocusCard">
                  <div class="geo-focus-card-hdr">
                    <span>Region: ${esc(selRegObj.name)}</span>
                    <span class="geo-reg-shape ${selRegObj.zone_type === 'circle' ? 'is-circle' : (selRegObj.zone_geojson ? 'is-poly' : 'is-none')}">${esc(selRegObj.zone_shape || 'Unmapped')}</span>
                  </div>
                  <div style="color:var(--muted);line-height:1.4">
                    ${(busByReg.get(norm(selRegObj.name)) || []).length ? `<div><b>Company Hub:</b> ${esc((busByReg.get(norm(selRegObj.name)) || []).join(', '))}</div>` : ''}
                    <div><b>Member Sites:</b> ${sitesByReg.get(norm(selRegObj.name)) || 0} registered</div>
                    ${selRegObj.distance_km != null ? `<div><b>Ref Distance from WTC:</b> ${round1(selRegObj.distance_km)} km</div>` : ''}
                  </div>
                  <div class="geo-focus-actions">
                    <button type="button" class="geo-mini-btn primary" data-geo-edit-circle="${esc(selRegObj.name)}">Set Circle</button>
                    <button type="button" class="geo-mini-btn" data-geo-edit-poly="${esc(selRegObj.name)}">Draw Zone</button>
                    <button type="button" class="geo-mini-btn" data-geo-filter-table-reg="${esc(selRegObj.name)}">Filter Table</button>
                  </div>
                </div>
              ` : ''}

              <div class="geo-leaflet-canvas" id="geoStudioMapCanvas"></div>
            </div>
          </div>

          <div class="geo-distance-bar" id="geoDistanceBar">
            <div class="geo-dist-selectors">
              <span class="geo-dist-lbl">KM Estimator</span>
              <select class="geo-dist-select" id="geoDistFrom" data-plain-options="1" aria-label="Distance Origin">${distOptionsHtml(STUDIO.distFrom)}</select>
              <button type="button" class="geo-swap-btn" id="geoDistSwapBtn">Swap</button>
              <select class="geo-dist-select" id="geoDistTo" data-plain-options="1" aria-label="Distance Destination">${distOptionsHtml(STUDIO.distTo)}</select>
            </div>
            <div class="geo-dist-readout" id="geoDistReadout">
              ${kmEst && kmEst.available ? `
                <span class="geo-km-badge" id="geoDistKmBadge">
                  One-Way: ${kmEst.oneWayKm.toFixed(1)} km${kmEst.roundTripKm != null ? ` · Round-Trip: ${kmEst.roundTripKm.toFixed(1)} km` : ''}
                </span>
                <span class="geo-km-sub" id="geoDistMetaSub">~${kmEst.estMinutes} min · ~${kmEst.estDieselL.toFixed(1)} L diesel (${esc(kmEst.source)})</span>
              ` : `
                <span class="geo-km-sub" id="geoDistKmBadge">Pin location on map to compute exact road KM</span>
              `}
              <div class="geo-km-override-grp">
                ${kmEst && kmEst.fromCoord && kmEst.toCoord && kmEst.fromCoord.lat != null && kmEst.toCoord.lat != null ? `<button type="button" class="geo-mini-btn" id="geoDistZoomBtn">Zoom Route</button>` : ''}
                <input type="number" step="0.1" min="0" class="geo-km-override-inp" id="geoDistOverrideInp" value="${hasOverride && kmEst ? kmEst.oneWayKm : ''}" placeholder="Exact km">
                <button type="button" class="geo-mini-btn" id="geoDistSaveOverrideBtn">${hasOverride ? 'Update KM' : 'Set KM'}</button>
                ${hasOverride ? `<button type="button" class="geo-mini-btn" id="geoDistClearOverrideBtn">Auto</button>` : ''}
              </div>
            </div>
          </div>
        ` : ''}
      </section>
    `;
  }

  function renderStudioMapLayers(L, map, ctx) {
    const { SEED, STATE, rerenderWorkspace } = ctx;
    if (STUDIO.layers) {
      STUDIO.layers.clearLayers();
    } else {
      STUDIO.layers = L.layerGroup().addTo(map);
    }
    const lg = STUDIO.layers;
    const regions = ((SEED && SEED.records && SEED.records.regions) || []).filter(r => r && !r.voided);
    const sites = ((SEED && SEED.records && SEED.records.sites) || []).filter(s => s && !s.voided);
    const siteStats = getUnifiedSiteStats(SEED, STATE);
    const hubs = getAllCompanyHubs(SEED);
    const selRegNorm = norm(STUDIO.selectedRegion);
    let focusBounds = null;

    const sitesByRegCnt = new Map();
    sites.forEach(s => {
      const rk = norm(s.region || s.geo_zone);
      if (rk) sitesByRegCnt.set(rk, (sitesByRegCnt.get(rk) || 0) + 1);
    });

    // 1. Draw Region Polygons & Circles with interactive hover glow + tooltip
    regions.forEach(r => {
      const rk = norm(r.name);
      const isSel = selRegNorm && selRegNorm === rk;
      const stroke = isSel ? '#D9A54A' : '#2563EB';
      const fill = isSel ? '#D9A54A' : '#3B82F6';
      const weight = isSel ? 3 : 1.5;
      const fillOp = isSel ? 0.20 : (selRegNorm ? 0.04 : 0.09);
      const sCnt = sitesByRegCnt.get(rk) || 0;
      const tipHtml = `${esc(r.name)} · ${sCnt} ${sCnt === 1 ? 'Site' : 'Sites'}`;

      if (r.zone_type === 'circle' && r.center_lat != null && r.center_lng != null && Number(r.radius_km) > 0) {
        const baseColor = isSel ? '#059669' : '#0D9488';
        const baseOp = isSel ? 0.22 : (selRegNorm ? 0.05 : 0.11);
        const baseW = isSel ? 3 : 1.6;
        const circ = L.circle([Number(r.center_lat), Number(r.center_lng)], {
          radius: Number(r.radius_km) * 1000,
          color: baseColor,
          fillColor: '#10B981',
          fillOpacity: baseOp,
          weight: baseW
        }).addTo(lg);
        if (STUDIO.mode === 'view' && circ.bindTooltip) {
          circ.bindTooltip(tipHtml, { sticky: true, className: 'geo-zone-tooltip', direction: 'top' });
          circ.on('mouseover', () => { circ.setStyle({ weight: baseW + 1.2, fillOpacity: Math.min(0.32, baseOp + 0.1) }); });
          circ.on('mouseout', () => { circ.setStyle({ weight: baseW, fillOpacity: baseOp }); });
        }
        circ.on('click', ev => {
          if (STUDIO.mode !== 'view') return;
          L.DomEvent.stopPropagation(ev);
          STUDIO.selectedRegion = r.name;
          rerenderWorkspace();
        });
        if (isSel) focusBounds = circ.getBounds();
      } else if (r.zone_geojson) {
        const gj = parseZoneGeoJson(r.zone_geojson);
        if (gj) {
          const geoLayer = L.geoJSON(gj, {
            style: { color: stroke, fillColor: fill, fillOpacity: fillOp, weight }
          }).addTo(lg);
          if (STUDIO.mode === 'view' && geoLayer.bindTooltip) {
            geoLayer.bindTooltip(tipHtml, { sticky: true, className: 'geo-zone-tooltip', direction: 'top' });
            geoLayer.on('mouseover', () => { geoLayer.setStyle({ weight: weight + 1.2, fillOpacity: Math.min(0.3, fillOp + 0.09) }); });
            geoLayer.on('mouseout', () => { geoLayer.setStyle({ weight, fillOpacity: fillOp }); });
          }
          geoLayer.on('click', ev => {
            if (STUDIO.mode !== 'view') return;
            L.DomEvent.stopPropagation(ev);
            STUDIO.selectedRegion = r.name;
            rerenderWorkspace();
          });
          if (isSel) {
            try { focusBounds = geoLayer.getBounds(); } catch (_) {}
          }
        }
      }
    });

    // 2. Draw Active Distance Route Line (From <-> To)
    const parseSpec = raw => {
      const s = String(raw || '');
      const idx = s.indexOf(':');
      return idx > 0 ? { type: s.slice(0, idx), name: s.slice(idx + 1) } : { type: 'site', name: s };
    };
    const fromSpec = parseSpec(STUDIO.distFrom);
    const toSpec = parseSpec(STUDIO.distTo);
    const kmEst = estimateLegKm(fromSpec, toSpec, SEED, {
      roundTripIfAnyBu: true,
      onAsyncRoute: () => {
        if (document.getElementById('geoMapStudioDeck')) rerenderWorkspace();
      }
    });
    if (kmEst && kmEst.fromCoord && kmEst.toCoord && kmEst.fromCoord.lat != null && kmEst.toCoord.lat != null && kmEst.oneWayKm > 0) {
      const latlngs = Array.isArray(kmEst.routeCoords) && kmEst.routeCoords.length > 1
        ? kmEst.routeCoords.map(pt => [pt[1], pt[0]])
        : [[kmEst.fromCoord.lat, kmEst.fromCoord.lng], [kmEst.toCoord.lat, kmEst.toCoord.lng]];
      L.polyline(latlngs, {
        color: '#B45309',
        weight: 3,
        dashArray: Array.isArray(kmEst.routeCoords) ? null : '6, 6',
        opacity: 0.85
      }).addTo(lg);
    }

    // 3. Draw Site Pins
    if (STUDIO.pinFilter !== 'bu') {
      sites.forEach(s => {
        if (s.latitude == null || s.longitude == null || s.latitude === '' || s.longitude === '') return;
        const lat = Number(s.latitude), lng = Number(s.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (selRegNorm && norm(s.region || s.geo_zone) !== selRegNorm) {
          const selR = regions.find(r => norm(r.name) === selRegNorm);
          if (!selR || !isPointInRegion(lat, lng, selR)) return;
        }
        const st = siteStats.byNorm.get(norm(s.name)) || { raw: 0, sales: 0, total: 0 };
        const isDual = st.raw > 0 && st.sales > 0;
        const isRaw = st.raw > 0 && st.sales === 0;
        const isSales = st.sales > 0 && st.raw === 0;
        if (STUDIO.pinFilter === 'dual' && !isDual) return;
        if (STUDIO.pinFilter === 'raw' && !(st.raw > 0)) return;
        if (STUDIO.pinFilter === 'sales' && !(st.sales > 0)) return;

        const color = isDual ? '#7C3AED' : (isRaw ? '#059669' : (isSales ? '#2563EB' : '#475569'));
        const showTopLabel = selRegNorm || st.total >= 700;
        const marker = L.marker([lat, lng], {
          icon: makeSvgPinIcon(L, color, showTopLabel ? s.name : '', false)
        }).addTo(lg);

        const wtcEst = estimateLegKm({ type: 'bu', name: 'WTC' }, { type: 'site', name: s.name }, SEED);
        const bbcEst = estimateLegKm({ type: 'bu', name: 'BBConstruction' }, { type: 'site', name: s.name }, SEED);
        marker.bindPopup(`
          <div style="min-width:190px;font-family:inherit;font-size:12px;line-height:1.45">
            <div style="font-weight:700;font-size:13px">${esc(s.name)}</div>
            <div style="color:#64748B">Region Zone: <b>${esc(s.region || s.geo_zone || 'Unassigned')}</b></div>
            <div>Loads: <b>${st.sales}</b> Sales · <b>${st.raw}</b> Raw</div>
            ${wtcEst && wtcEst.available ? `<div>From WTC: <b>${wtcEst.oneWayKm.toFixed(1)} km</b> (RT ${wtcEst.roundTripKm.toFixed(1)} km)</div>` : ''}
            ${bbcEst && bbcEst.available ? `<div>From BBConstruction: <b>${bbcEst.oneWayKm.toFixed(1)} km</b> (RT ${bbcEst.roundTripKm.toFixed(1)} km)</div>` : ''}
            <div style="display:flex;gap:5px;margin-top:6px">
              <button type="button" class="geo-mini-btn primary" data-popup-measure-to="site:${esc(s.name)}">Measure KM</button>
              <button type="button" class="geo-mini-btn" data-popup-repin-site="${esc(s.name)}">Move Pin</button>
            </div>
          </div>
        `);
      });
    }

    // 4. Draw Company BU Hub Pins (Always clear & prominent!)
    hubs.forEach(h => {
      const marker = L.marker([h.lat, h.lng], {
        icon: makeSvgPinIcon(L, '#D9A54A', h.name, true),
        zIndexOffset: 900
      }).addTo(lg);
      marker.bindPopup(`
        <div style="min-width:190px;font-family:inherit;font-size:12px;line-height:1.45">
          <div style="font-weight:700;font-size:13px">${esc(h.label)}</div>
          <div>Business Unit: <b>${esc(h.name)}</b></div>
          <div>Inside Region Zone: <b>${esc(h.region || 'Unassigned')}</b></div>
          <div style="color:#64748B">GPS: ${h.lat.toFixed(5)}, ${h.lng.toFixed(5)}</div>
          <div style="display:flex;gap:5px;margin-top:6px">
            <button type="button" class="geo-mini-btn primary" data-popup-measure-from="bu:${esc(h.name)}">Start KM Here</button>
            <button type="button" class="geo-mini-btn" data-popup-repin-bu="${esc(h.name)}">Move Hub Pin</button>
          </div>
        </div>
      `);
    });

    // 5. Draw Live Draft Overlays (Circle / Polygon / Pin Placement)
    if (STUDIO.mode === 'circle' && STUDIO.circleCenter) {
      L.circle([STUDIO.circleCenter.lat, STUDIO.circleCenter.lng], {
        radius: Math.max(0.2, Number(STUDIO.circleRadiusKm || 1.5)) * 1000,
        color: '#D97706',
        fillColor: '#F59E0B',
        fillOpacity: 0.24,
        weight: 2.5,
        dashArray: '5, 4'
      }).addTo(lg);
    } else if (STUDIO.mode === 'polygon' && STUDIO.polyPoints.length > 0) {
      const latlngs = STUDIO.polyPoints.map(pt => [pt[1], pt[0]]);
      if (latlngs.length >= 3) {
        L.polygon(latlngs, { color: '#D97706', fillColor: '#F59E0B', fillOpacity: 0.24, weight: 2.5 }).addTo(lg);
      } else {
        L.polyline(latlngs, { color: '#D97706', weight: 2.5, dashArray: '5, 4' }).addTo(lg);
      }
      latlngs.forEach(ll => {
        L.circleMarker(ll, { radius: 5, color: '#B45309', fillColor: '#FFFFFF', fillOpacity: 1, weight: 2 }).addTo(lg);
      });
    } else if (STUDIO.mode === 'pin' && STUDIO.pinLat != null && STUDIO.pinLng != null) {
      L.marker([STUDIO.pinLat, STUDIO.pinLng], {
        icon: makeSvgPinIcon(L, '#DC2626', STUDIO.pinTargetName || 'New Pin', STUDIO.pinTargetType === 'bu'),
        zIndexOffset: 1000
      }).addTo(lg);
    }

    if (focusBounds && focusBounds.isValid && focusBounds.isValid()) {
      map.fitBounds(focusBounds, { padding: [26, 26], maxZoom: 14, animate: false });
    } else if (!selRegNorm && !STUDIO._userPanned) {
      map.setView([33.76, 35.52], 9, { animate: false });
    }
  }

  function persistRegionZone(regName, spec, ctx) {
    if (regName && typeof regName === 'object') {
      ctx = spec || {};
      spec = regName;
      regName = spec.name || spec.region || '';
    }
    ctx = ctx || {};
    const { SEED, STATE, postRecordToLocalApi, toast, uid } = ctx;
    const cleanName = String(regName || '').trim();
    if (!cleanName) {
      if (toast) toast('Enter or select a Region name first', 'err');
      return false;
    }
    const nk = norm(cleanName);
    const nowIso = new Date().toISOString();
    GEO_STORE.regions[nk] = {
      name: cleanName,
      zone_type: spec.zone_type,
      center_lat: spec.center_lat,
      center_lng: spec.center_lng,
      radius_km: spec.radius_km || null,
      zone_geojson: spec.zone_geojson || null,
      updated_at: nowIso
    };
    saveStoredConfig(true);

    const regions = (SEED.records && SEED.records.regions) || [];
    let row = regions.find(r => r && !r.voided && norm(r.name) === nk);
    const wtcHub = getCompanyHub('WTC', SEED);
    const distKm = (spec.center_lat != null && spec.center_lng != null)
      ? round1(roadAdjustedKm(wtcHub.lat, wtcHub.lng, spec.center_lat, spec.center_lng))
      : null;

    if (row) {
      row.zone_type = spec.zone_type;
      row.center_lat = spec.center_lat;
      row.center_lng = spec.center_lng;
      row.radius_km = spec.radius_km || null;
      row.zone_geojson = spec.zone_geojson || null;
      if (row.distance_km == null && distKm != null) row.distance_km = distKm;
      row.modified_at = nowIso;
      row.modified_by = (ctx.userEmail || 'app');
    } else {
      row = {
        id: typeof uid === 'function' ? uid('re') : ('re_' + Date.now()),
        name: cleanName,
        region: cleanName,
        code: cleanName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 10),
        corridor: 'Mount Lebanon',
        zone_type: spec.zone_type,
        center_lat: spec.center_lat,
        center_lng: spec.center_lng,
        radius_km: spec.radius_km || null,
        zone_geojson: spec.zone_geojson || null,
        distance_km: distKm,
        source: 'app',
        entered_at: nowIso,
        voided: false
      };
      regions.unshift(row);
      if (STATE && STATE.customRecords) {
        if (!Array.isArray(STATE.customRecords.regions)) STATE.customRecords.regions = [];
        STATE.customRecords.regions.unshift(row);
      }
    }

    // Auto-assign any pinned Sites and Company BUs that fall inside this newly saved Zone (when unassigned or matching)
    hydrateSeedGeo(SEED, true);
    let insideCount = 0;
    ((SEED.records && SEED.records.sites) || []).forEach(s => {
      if (!s || s.voided || s.latitude == null || s.longitude == null) return;
      if (isPointInRegion(Number(s.latitude), Number(s.longitude), row)) {
        insideCount++;
        const det = findContainingRegion(Number(s.latitude), Number(s.longitude), SEED);
        s.geo_zone = det.best || cleanName;
        if (s.source === 'app' && (!s.region || norm(det.best) === nk)) s.region = det.best || cleanName;
      }
    });

    SEED._customRev = (SEED._customRev || 0) + 1;
    if (typeof postRecordToLocalApi === 'function') postRecordToLocalApi('regions', Object.assign({}, row, { modified_by: ctx.userEmail || 'app' }));
    if (toast) toast(`Saved ${spec.zone_type === 'circle' ? `Circle (${round1(spec.radius_km)} km)` : 'Polygon Zone'} for ${cleanName} (${insideCount} pinned sites inside)`, 'ok');
    return true;
  }

  function persistLocationPin(targetType, targetName, lat, lng, explicitRegion, ctx) {
    if (targetType && typeof targetType === 'object') {
      ctx = targetName || {};
      const obj = targetType;
      explicitRegion = obj.region || '';
      lng = obj.lng != null ? obj.lng : obj.longitude;
      lat = obj.lat != null ? obj.lat : obj.latitude;
      targetName = obj.name || obj.site || '';
      targetType = obj.targetType || 'site';
    }
    ctx = ctx || {};
    const { SEED, STATE, postRecordToLocalApi, toast, uid } = ctx;
    const cleanName = String(targetName || '').trim();
    if (!cleanName) {
      if (toast) toast('Select or type a Site or Company BU name', 'err');
      return false;
    }
    if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      if (toast) toast('Click a point on the map or paste valid GPS coordinates', 'err');
      return false;
    }
    const nLat = round5(lat), nLng = round5(lng);
    if (targetType === 'bu') {
      const hub = setCompanyHubPin(cleanName, nLat, nLng, SEED, explicitRegion);
      SEED._customRev = (SEED._customRev || 0) + 1;
      if (toast) toast(`Pinned Company BU ${hub.name} at (${nLat}, ${nLng}) inside ${hub.region || 'Lebanon'}`, 'ok');
      return true;
    }

    const nk = norm(cleanName);
    const det = findContainingRegion(nLat, nLng, SEED);
    const region = explicitRegion || det.best || '';
    const nowIso = new Date().toISOString();
    GEO_STORE.sites[nk] = { name: cleanName, latitude: nLat, longitude: nLng, region, updated_at: nowIso };
    saveStoredConfig(true);

    const sites = (SEED.records && SEED.records.sites) || [];
    let row = sites.find(s => s && !s.voided && norm(s.name) === nk);
    if (row) {
      row.latitude = nLat;
      row.longitude = nLng;
      if (region) row.region = region;
      row.modified_at = nowIso;
      row.modified_by = ctx.userEmail || 'app';
    } else {
      row = {
        id: typeof uid === 'function' ? uid('si') : ('si_' + Date.now()),
        name: cleanName,
        region,
        latitude: nLat,
        longitude: nLng,
        is_jv: /\bjv\b/i.test(cleanName),
        source: 'app',
        entered_at: nowIso,
        voided: false
      };
      sites.unshift(row);
      if (STATE && STATE.customRecords) {
        if (!Array.isArray(STATE.customRecords.sites)) STATE.customRecords.sites = [];
        STATE.customRecords.sites.unshift(row);
      }
    }
    hydrateSeedGeo(SEED, true);
    SEED._customRev = (SEED._customRev || 0) + 1;
    if (typeof postRecordToLocalApi === 'function') postRecordToLocalApi('sites', Object.assign({}, row, { modified_by: ctx.userEmail || 'app' }));
    if (toast) toast(`Pinned ${cleanName}${region ? ' in zone ' + region : ''}`, 'ok');
    return true;
  }

  function wireGeoStudio(container, ctx) {
    const deck = container && container.querySelector('#geoMapStudioDeck');
    if (!deck) return;
    const { SEED, STATE, rerenderWorkspace, toast } = ctx;

    const collapseBtn = deck.querySelector('#geoToggleCollapseBtn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        STUDIO.collapsed = !STUDIO.collapsed;
        rerenderWorkspace();
      });
    }
    if (STUDIO.collapsed) return;

    // Mode buttons
    deck.querySelectorAll('[data-geo-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextMode = btn.getAttribute('data-geo-mode') || 'view';
        STUDIO.mode = nextMode;
        if (nextMode === 'circle' && STUDIO.selectedRegion) {
          STUDIO.drawRegionName = STUDIO.selectedRegion;
          const rRow = ((SEED.records && SEED.records.regions) || []).find(r => norm(r.name) === norm(STUDIO.selectedRegion));
          if (rRow && rRow.center_lat != null && rRow.center_lng != null) {
            STUDIO.circleCenter = { lat: Number(rRow.center_lat), lng: Number(rRow.center_lng) };
            STUDIO.circleRadiusKm = Number(rRow.radius_km) > 0 ? Number(rRow.radius_km) : 1.5;
          }
        } else if (nextMode === 'polygon') {
          STUDIO.drawRegionName = STUDIO.selectedRegion || '';
          STUDIO.polyPoints = [];
        } else if (nextMode === 'pin' && !STUDIO.pinTargetName) {
          STUDIO.pinTargetType = 'site';
          STUDIO.pinTargetName = '';
        }
        rerenderWorkspace();
      });
    });

    // Region search & selection cards
    const searchInp = deck.querySelector('#geoRegionSearch');
    if (searchInp) {
      searchInp.addEventListener('input', () => {
        STUDIO.regionSearch = searchInp.value;
        rerenderWorkspace();
      });
    }
    deck.querySelectorAll('[data-geo-region]').forEach(card => {
      card.addEventListener('click', () => {
        STUDIO.selectedRegion = card.getAttribute('data-geo-region') || '';
        STUDIO._userPanned = false;
        rerenderWorkspace();
      });
    });
    deck.querySelectorAll('[data-geo-jump-bu]').forEach(chip => {
      chip.addEventListener('click', () => {
        const bu = chip.getAttribute('data-geo-jump-bu') || 'WTC';
        const hub = getCompanyHub(bu, SEED);
        STUDIO.selectedRegion = hub.region || '';
        STUDIO.distFrom = `bu:${hub.name}`;
        STUDIO._userPanned = false;
        rerenderWorkspace();
      });
    });

    // Pin filter chips & Lebanon view reset
    deck.querySelectorAll('[data-geo-pin-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        STUDIO.pinFilter = chip.getAttribute('data-geo-pin-filter') || 'all';
        rerenderWorkspace();
      });
    });
    const resetBtn = deck.querySelector('#geoResetLebanonViewBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        STUDIO.selectedRegion = '';
        STUDIO._userPanned = false;
        rerenderWorkspace();
      });
    }

    // Focus card quick actions
    deck.querySelectorAll('[data-geo-edit-circle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nm = btn.getAttribute('data-geo-edit-circle') || '';
        STUDIO.selectedRegion = nm;
        STUDIO.drawRegionName = nm;
        STUDIO.mode = 'circle';
        const rRow = ((SEED.records && SEED.records.regions) || []).find(r => norm(r.name) === norm(nm));
        if (rRow && rRow.center_lat != null && rRow.center_lng != null) {
          STUDIO.circleCenter = { lat: Number(rRow.center_lat), lng: Number(rRow.center_lng) };
          STUDIO.circleRadiusKm = Number(rRow.radius_km) > 0 ? Number(rRow.radius_km) : 1.5;
        }
        rerenderWorkspace();
      });
    });
    deck.querySelectorAll('[data-geo-edit-poly]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nm = btn.getAttribute('data-geo-edit-poly') || '';
        STUDIO.selectedRegion = nm;
        STUDIO.drawRegionName = nm;
        STUDIO.mode = 'polygon';
        STUDIO.polyPoints = [];
        rerenderWorkspace();
      });
    });
    deck.querySelectorAll('[data-geo-filter-table-reg]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nm = btn.getAttribute('data-geo-filter-table-reg') || '';
        if (STATE) {
          STATE.search = nm;
          rerenderWorkspace();
        }
      });
    });

    // Tool Drawer controls (Circle / Polygon / Pin)
    const drawRegInp = deck.querySelector('#geoDrawRegionInp');
    if (drawRegInp) {
      drawRegInp.addEventListener('input', () => { STUDIO.drawRegionName = drawRegInp.value; });
    }
    const radInp = deck.querySelector('#geoCircleRadiusInp');
    const radSlider = deck.querySelector('#geoCircleRadiusSlider');
    const syncLiveCircleInsideBadge = () => {
      const pill = deck.querySelector('#geoLiveInsideCountPill');
      if (!pill) return;
      if (!STUDIO.circleCenter) { pill.hidden = true; return; }
      let cnt = 0;
      const radKm = Math.max(0.2, Number(STUDIO.circleRadiusKm || 1.5));
      ((SEED && SEED.records && SEED.records.sites) || []).forEach(s => {
        if (s && !s.voided && s.latitude != null && s.longitude != null && pointInCircle(Number(s.latitude), Number(s.longitude), STUDIO.circleCenter.lat, STUDIO.circleCenter.lng, radKm)) cnt++;
      });
      pill.hidden = false;
      pill.textContent = `${cnt} ${cnt === 1 ? 'Site' : 'Sites'} inside`;
    };
    if (radInp) {
      radInp.addEventListener('input', () => {
        STUDIO.circleRadiusKm = Math.max(0.2, parseFloat(radInp.value) || 1.5);
        if (radSlider) radSlider.value = String(Math.min(25, Math.max(0.3, STUDIO.circleRadiusKm)));
        syncLiveCircleInsideBadge();
        if (STUDIO.map && window.L) renderStudioMapLayers(window.L, STUDIO.map, ctx);
      });
    }
    if (radSlider) {
      radSlider.addEventListener('input', () => {
        STUDIO.circleRadiusKm = Math.max(0.2, parseFloat(radSlider.value) || 1.5);
        if (radInp) radInp.value = String(round1(STUDIO.circleRadiusKm));
        syncLiveCircleInsideBadge();
        if (STUDIO.map && window.L) renderStudioMapLayers(window.L, STUDIO.map, ctx);
      });
    }
    deck.querySelectorAll('[data-geo-radius-preset]').forEach(pill => {
      pill.addEventListener('click', () => {
        STUDIO.circleRadiusKm = parseFloat(pill.getAttribute('data-geo-radius-preset')) || 1.5;
        rerenderWorkspace();
      });
    });
    const undoPtBtn = deck.querySelector('#geoUndoPtBtn');
    if (undoPtBtn) {
      undoPtBtn.addEventListener('click', () => {
        STUDIO.polyPoints.pop();
        rerenderWorkspace();
      });
    }
    const clearPtsBtn = deck.querySelector('#geoClearPtsBtn');
    if (clearPtsBtn) {
      clearPtsBtn.addEventListener('click', () => {
        STUDIO.polyPoints = [];
        rerenderWorkspace();
      });
    }
    const saveZoneBtn = deck.querySelector('#geoSaveZoneBtn');
    if (saveZoneBtn) {
      saveZoneBtn.addEventListener('click', () => {
        const regName = (drawRegInp ? drawRegInp.value : STUDIO.drawRegionName).trim();
        if (STUDIO.mode === 'circle') {
          if (!STUDIO.circleCenter) {
            if (toast) toast('Click on the map to place the Circle center first', 'err');
            return;
          }
          if (persistRegionZone(regName, {
            zone_type: 'circle',
            center_lat: STUDIO.circleCenter.lat,
            center_lng: STUDIO.circleCenter.lng,
            radius_km: Math.max(0.2, Number(STUDIO.circleRadiusKm || 1.5)),
            zone_geojson: null
          }, ctx)) {
            STUDIO.selectedRegion = regName;
            STUDIO.mode = 'view';
            rerenderWorkspace();
          }
        } else if (STUDIO.mode === 'polygon') {
          if (STUDIO.polyPoints.length < 3) {
            if (toast) toast('Click at least 3 points on the map to create a Polygon Zone', 'err');
            return;
          }
          const ring = STUDIO.polyPoints.slice();
          if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
            ring.push([ring[0][0], ring[0][1]]);
          }
          const lngs = ring.map(p => p[0]), lats = ring.map(p => p[1]);
          const cLat = round5((Math.min(...lats) + Math.max(...lats)) / 2);
          const cLng = round5((Math.min(...lngs) + Math.max(...lngs)) / 2);
          if (persistRegionZone(regName, {
            zone_type: 'polygon',
            center_lat: cLat,
            center_lng: cLng,
            radius_km: null,
            zone_geojson: { type: 'Polygon', coordinates: [ring] }
          }, ctx)) {
            STUDIO.selectedRegion = regName;
            STUDIO.mode = 'view';
            STUDIO.polyPoints = [];
            rerenderWorkspace();
          }
        }
      });
    }

    // Pin tool controls
    const pinTypeSel = deck.querySelector('#geoPinTypeSel');
    if (pinTypeSel) {
      pinTypeSel.addEventListener('change', () => {
        STUDIO.pinTargetType = pinTypeSel.value === 'bu' ? 'bu' : 'site';
        if (STUDIO.pinTargetType === 'bu') {
          STUDIO.pinTargetName = 'WTC';
          const h = getCompanyHub('WTC', SEED);
          STUDIO.pinLat = h.lat; STUDIO.pinLng = h.lng; STUDIO.pinRegion = h.region;
        } else {
          STUDIO.pinTargetName = '';
        }
        rerenderWorkspace();
      });
    }
    const pinBuSel = deck.querySelector('#geoPinBuSel');
    if (pinBuSel) {
      pinBuSel.addEventListener('change', () => {
        STUDIO.pinTargetName = pinBuSel.value;
        const h = getCompanyHub(STUDIO.pinTargetName, SEED);
        STUDIO.pinLat = h.lat; STUDIO.pinLng = h.lng; STUDIO.pinRegion = h.region;
        rerenderWorkspace();
      });
    }
    const pinSiteInp = deck.querySelector('#geoPinSiteInp');
    if (pinSiteInp) {
      const onSiteInp = () => {
        STUDIO.pinTargetName = pinSiteInp.value;
        const sRow = ((SEED.records && SEED.records.sites) || []).find(s => s && norm(s.name) === norm(STUDIO.pinTargetName));
        if (sRow && sRow.latitude != null && sRow.longitude != null) {
          STUDIO.pinLat = Number(sRow.latitude);
          STUDIO.pinLng = Number(sRow.longitude);
          STUDIO.pinRegion = sRow.region || findContainingRegion(STUDIO.pinLat, STUDIO.pinLng, SEED).best || '';
          const cp = deck.querySelector('#geoPinCoordPasteInp');
          if (cp) cp.value = `${STUDIO.pinLat}, ${STUDIO.pinLng}`;
          const rp = deck.querySelector('#geoPinRegionInp');
          if (rp) rp.value = STUDIO.pinRegion;
          if (STUDIO.map && window.L) renderStudioMapLayers(window.L, STUDIO.map, ctx);
        }
      };
      pinSiteInp.addEventListener('change', onSiteInp);
      pinSiteInp.addEventListener('input', () => { STUDIO.pinTargetName = pinSiteInp.value; });
    }
    const pinCoordPasteInp = deck.querySelector('#geoPinCoordPasteInp');
    if (pinCoordPasteInp) {
      pinCoordPasteInp.addEventListener('change', () => {
        const parsed = parsePastedCoordinates(pinCoordPasteInp.value);
        if (parsed) {
          STUDIO.pinLat = parsed.lat;
          STUDIO.pinLng = parsed.lng;
          STUDIO.pinRegion = findContainingRegion(parsed.lat, parsed.lng, SEED).best || STUDIO.pinRegion;
          pinCoordPasteInp.value = `${parsed.lat}, ${parsed.lng}`;
          const rp = deck.querySelector('#geoPinRegionInp');
          if (rp) rp.value = STUDIO.pinRegion;
          if (STUDIO.map && window.L) {
            STUDIO.map.setView([parsed.lat, parsed.lng], 14, { animate: false });
            renderStudioMapLayers(window.L, STUDIO.map, ctx);
          }
        }
      });
    }
    const pinRegInp = deck.querySelector('#geoPinRegionInp');
    if (pinRegInp) {
      pinRegInp.addEventListener('input', () => { STUDIO.pinRegion = pinRegInp.value; });
    }
    const savePinBtn = deck.querySelector('#geoSavePinBtn');
    if (savePinBtn) {
      savePinBtn.addEventListener('click', () => {
        const tName = STUDIO.pinTargetType === 'bu'
          ? ((pinBuSel && pinBuSel.value) || STUDIO.pinTargetName || 'WTC')
          : ((pinSiteInp && pinSiteInp.value) || STUDIO.pinTargetName);
        if (pinCoordPasteInp && pinCoordPasteInp.value) {
          const parsed = parsePastedCoordinates(pinCoordPasteInp.value);
          if (parsed) { STUDIO.pinLat = parsed.lat; STUDIO.pinLng = parsed.lng; }
        }
        const regVal = (pinRegInp && pinRegInp.value.trim()) || STUDIO.pinRegion || '';
        if (persistLocationPin(STUDIO.pinTargetType, tName, STUDIO.pinLat, STUDIO.pinLng, regVal, ctx)) {
          STUDIO.mode = 'view';
          if (STUDIO.pinTargetType === 'site') STUDIO.distTo = `site:${tName}`;
          else STUDIO.distFrom = `bu:${tName}`;
          rerenderWorkspace();
        }
      });
    }

    // Distance Estimator Bar controls
    const distFromSel = deck.querySelector('#geoDistFrom');
    const distToSel = deck.querySelector('#geoDistTo');
    if (distFromSel) {
      distFromSel.addEventListener('change', () => { STUDIO.distFrom = distFromSel.value; rerenderWorkspace(); });
    }
    if (distToSel) {
      distToSel.addEventListener('change', () => { STUDIO.distTo = distToSel.value; rerenderWorkspace(); });
    }
    const swapBtn = deck.querySelector('#geoDistSwapBtn');
    if (swapBtn) {
      swapBtn.addEventListener('click', () => {
        const tmp = STUDIO.distFrom;
        STUDIO.distFrom = STUDIO.distTo;
        STUDIO.distTo = tmp;
        rerenderWorkspace();
      });
    }
    const parseSpec = raw => {
      const s = String(raw || '');
      const idx = s.indexOf(':');
      return idx > 0 ? { type: s.slice(0, idx), name: s.slice(idx + 1) } : { type: 'site', name: s };
    };
    const saveOvBtn = deck.querySelector('#geoDistSaveOverrideBtn');
    const ovInp = deck.querySelector('#geoDistOverrideInp');
    if (saveOvBtn && ovInp) {
      saveOvBtn.addEventListener('click', () => {
        const v = parseFloat(ovInp.value);
        if (!Number.isFinite(v) || v < 0) {
          if (toast) toast('Enter a valid non-negative KM value', 'err');
          return;
        }
        setPairKmOverride(parseSpec(STUDIO.distFrom), parseSpec(STUDIO.distTo), v);
        if (toast) toast(`Saved ${round1(v)} km distance override`, 'ok');
        rerenderWorkspace();
      });
    }
    const clearOvBtn = deck.querySelector('#geoDistClearOverrideBtn');
    if (clearOvBtn) {
      clearOvBtn.addEventListener('click', () => {
        setPairKmOverride(parseSpec(STUDIO.distFrom), parseSpec(STUDIO.distTo), null);
        rerenderWorkspace();
      });
    }
    const zoomRouteBtn = deck.querySelector('#geoDistZoomBtn');
    if (zoomRouteBtn) {
      zoomRouteBtn.addEventListener('click', () => {
        const est = estimateLegKm(parseSpec(STUDIO.distFrom), parseSpec(STUDIO.distTo), SEED);
        if (STUDIO.map && window.L && est && est.fromCoord && est.toCoord && est.fromCoord.lat != null && est.toCoord.lat != null) {
          STUDIO._userPanned = true;
          const b = window.L.latLngBounds([[est.fromCoord.lat, est.fromCoord.lng], [est.toCoord.lat, est.toCoord.lng]]);
          STUDIO.map.fitBounds(b, { padding: [42, 42], maxZoom: 13, animate: false });
        }
      });
    }

    // Mount Leaflet Map inside #geoStudioMapCanvas
    const canvas = deck.querySelector('#geoStudioMapCanvas');
    if (!canvas) return;
    ensureLeaflet().then(L => {
      if (!canvas.isConnected) return;
      if (STUDIO.map) {
        try { STUDIO.map.remove(); } catch (_) {}
        STUDIO.map = null;
        STUDIO.layers = null;
      }
      const map = L.map(canvas, { zoomControl: true, attributionControl: false }).setView([33.76, 35.52], 9);
      STUDIO.map = map;
      addBaseTiles(L, map);
      renderStudioMapLayers(L, map, ctx);
      setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 40);

      map.on('dragend', () => { STUDIO._userPanned = true; });
      map.on('click', ev => {
        const lat = round5(ev.latlng.lat), lng = round5(ev.latlng.lng);
        if (STUDIO.mode === 'circle') {
          STUDIO.circleCenter = { lat, lng };
          const lbl = deck.querySelector('#geoDraftCoordsLbl');
          if (lbl) lbl.textContent = `Center: ${lat}, ${lng}`;
          syncLiveCircleInsideBadge();
          renderStudioMapLayers(L, map, ctx);
        } else if (STUDIO.mode === 'polygon') {
          STUDIO.polyPoints.push([lng, lat]);
          const lbl = deck.querySelector('#geoPolyPtsLbl');
          if (lbl) lbl.innerHTML = `Vertices: <b>${STUDIO.polyPoints.length}</b> (click Save Polygon Zone when ready)`;
          renderStudioMapLayers(L, map, ctx);
        } else if (STUDIO.mode === 'pin') {
          STUDIO.pinLat = lat;
          STUDIO.pinLng = lng;
          const det = findContainingRegion(lat, lng, SEED);
          STUDIO.pinRegion = det.best || '';
          const cp = deck.querySelector('#geoPinCoordPasteInp');
          if (cp) cp.value = `${lat}, ${lng}`;
          const rp = deck.querySelector('#geoPinRegionInp');
          if (rp) rp.value = STUDIO.pinRegion;
          renderStudioMapLayers(L, map, ctx);
        }
      });

      map.on('popupopen', ev => {
        const popEl = ev.popup && ev.popup.getElement && ev.popup.getElement();
        if (!popEl) return;
        popEl.querySelectorAll('[data-popup-measure-to]').forEach(b => {
          b.addEventListener('click', () => {
            STUDIO.distTo = b.getAttribute('data-popup-measure-to');
            rerenderWorkspace();
          });
        });
        popEl.querySelectorAll('[data-popup-measure-from]').forEach(b => {
          b.addEventListener('click', () => {
            STUDIO.distFrom = b.getAttribute('data-popup-measure-from');
            rerenderWorkspace();
          });
        });
        popEl.querySelectorAll('[data-popup-repin-site]').forEach(b => {
          b.addEventListener('click', () => {
            const nm = b.getAttribute('data-popup-repin-site') || '';
            STUDIO.mode = 'pin';
            STUDIO.pinTargetType = 'site';
            STUDIO.pinTargetName = nm;
            const sRow = ((SEED.records && SEED.records.sites) || []).find(s => s && norm(s.name) === norm(nm));
            if (sRow && sRow.latitude != null) { STUDIO.pinLat = Number(sRow.latitude); STUDIO.pinLng = Number(sRow.longitude); STUDIO.pinRegion = sRow.region || ''; }
            rerenderWorkspace();
          });
        });
        popEl.querySelectorAll('[data-popup-repin-bu]').forEach(b => {
          b.addEventListener('click', () => {
            const bu = b.getAttribute('data-popup-repin-bu') || 'WTC';
            const h = getCompanyHub(bu, SEED);
            STUDIO.mode = 'pin';
            STUDIO.pinTargetType = 'bu';
            STUDIO.pinTargetName = h.name;
            STUDIO.pinLat = h.lat; STUDIO.pinLng = h.lng; STUDIO.pinRegion = h.region;
            rerenderWorkspace();
          });
        });
      });
    }).catch(() => {});
  }

  // ==================== INLINE MODAL MAP PICKERS (SITE & REGION FORMS) ====================
  let _activeModalMap = null;
  function wireModalSiteOrRegionMap(hostEl, formType, SEED) {
    if (!hostEl) return;
    hydrateSeedGeo(SEED);
    if (_activeModalMap) {
      try { _activeModalMap.remove(); } catch (_) {}
      _activeModalMap = null;
    }
    if (formType === 'site') {
      const canvas = hostEl.querySelector('#modalSiteMapCanvas');
      if (!canvas || canvas.dataset.geoWired === '1') return;
      canvas.dataset.geoWired = '1';
      ensureLeaflet().then(L => {
        if (!canvas.isConnected) return;
        const latInp = hostEl.querySelector('#f_lat');
        const lngInp = hostEl.querySelector('#f_lng');
        const regInp = hostEl.querySelector('#f_region');
        const pasteInp = hostEl.querySelector('#f_site_coord_paste');
        const kmStatus = hostEl.querySelector('#modalSiteKmReadout');

        const map = L.map(canvas, { zoomControl: true, attributionControl: false }).setView([33.85, 35.51], 10);
        _activeModalMap = map;
        addBaseTiles(L, map);
        const lg = L.layerGroup().addTo(map);
        setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 50);

        const refreshSiteOverlay = () => {
          lg.clearLayers();
          ((SEED.records && SEED.records.regions) || []).forEach(r => {
            if (!r || r.voided) return;
            if (r.zone_type === 'circle' && r.center_lat != null && r.radius_km > 0) {
              L.circle([Number(r.center_lat), Number(r.center_lng)], { radius: Number(r.radius_km) * 1000, color: '#0D9488', fillOpacity: 0.08, weight: 1.4 }).addTo(lg);
            } else if (r.zone_geojson) {
              const gj = parseZoneGeoJson(r.zone_geojson);
              if (gj) L.geoJSON(gj, { style: { color: '#2563EB', fillOpacity: 0.06, weight: 1.3 } }).addTo(lg);
            }
          });
          getAllCompanyHubs(SEED).forEach(h => {
            L.marker([h.lat, h.lng], { icon: makeSvgPinIcon(L, '#D9A54A', h.name, true) }).addTo(lg);
          });
          const lat = latInp && latInp.value ? parseFloat(latInp.value) : null;
          const lng = lngInp && lngInp.value ? parseFloat(lngInp.value) : null;
          if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
            L.marker([lat, lng], { icon: makeSvgPinIcon(L, '#DC2626', 'Site Pin', false) }).addTo(lg);
            const wtcHub = getCompanyHub('WTC', SEED);
            const ow = roadAdjustedKm(wtcHub.lat, wtcHub.lng, lat, lng);
            const det = findContainingRegion(lat, lng, SEED);
            if (det.best && regInp && !regInp.value) regInp.value = det.best;
            if (kmStatus) {
              kmStatus.textContent = `${det.best ? 'Zone: ' + det.best + ' · ' : ''}From WTC: One-Way ${ow.toFixed(1)} km · Round-Trip ${(ow * 2).toFixed(1)} km`;
            }
          }
        };

        refreshSiteOverlay();
        map.on('click', ev => {
          const lat = round5(ev.latlng.lat), lng = round5(ev.latlng.lng);
          if (latInp) latInp.value = String(lat);
          if (lngInp) lngInp.value = String(lng);
          const det = findContainingRegion(lat, lng, SEED);
          if (det.best && regInp) regInp.value = det.best;
          refreshSiteOverlay();
        });
        [latInp, lngInp].forEach(el => { if (el) el.addEventListener('change', refreshSiteOverlay); });
        if (pasteInp) {
          pasteInp.addEventListener('change', () => {
            const p = parsePastedCoordinates(pasteInp.value);
            if (p) {
              if (latInp) latInp.value = String(p.lat);
              if (lngInp) lngInp.value = String(p.lng);
              const det = findContainingRegion(p.lat, p.lng, SEED);
              if (det.best && regInp) regInp.value = det.best;
              map.setView([p.lat, p.lng], 13, { animate: false });
              refreshSiteOverlay();
            }
          });
        }
      }).catch(() => {});
    } else if (formType === 'region') {
      const canvas = hostEl.querySelector('#modalRegionMapCanvas');
      if (!canvas || canvas.dataset.geoWired === '1') return;
      canvas.dataset.geoWired = '1';
      ensureLeaflet().then(L => {
        if (!canvas.isConnected) return;
        const shapeSel = hostEl.querySelector('#f_zone_type');
        const radInp = hostEl.querySelector('#f_radius_km');
        const cLatInp = hostEl.querySelector('#f_center_lat');
        const cLngInp = hostEl.querySelector('#f_center_lng');
        const gjInp = hostEl.querySelector('#f_zone_geojson');
        const distInp = hostEl.querySelector('#f_distance_km');
        const statusEl = hostEl.querySelector('#modalRegionZoneHint');
        let polyPts = [];

        const map = L.map(canvas, { zoomControl: true, attributionControl: false }).setView([33.85, 35.51], 10);
        _activeModalMap = map;
        addBaseTiles(L, map);
        const lg = L.layerGroup().addTo(map);
        setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 50);

        const redraw = () => {
          lg.clearLayers();
          getAllCompanyHubs(SEED).forEach(h => {
            L.marker([h.lat, h.lng], { icon: makeSvgPinIcon(L, '#D9A54A', h.name, true) }).addTo(lg);
          });
          const zt = (shapeSel && shapeSel.value) || 'circle';
          if (zt === 'circle') {
            const clat = cLatInp && cLatInp.value ? parseFloat(cLatInp.value) : null;
            const clng = cLngInp && cLngInp.value ? parseFloat(cLngInp.value) : null;
            const rad = radInp && radInp.value ? parseFloat(radInp.value) : 1.5;
            if (clat != null && clng != null && Number.isFinite(clat) && Number.isFinite(clng)) {
              L.circle([clat, clng], { radius: Math.max(0.2, rad) * 1000, color: '#059669', fillColor: '#10B981', fillOpacity: 0.22, weight: 2.5 }).addTo(lg);
              if (statusEl) statusEl.textContent = `Circle center (${clat}, ${clng}) · Radius ${round1(rad)} km`;
            } else if (statusEl) {
              statusEl.textContent = 'Click anywhere on the map to place the Region Circle center';
            }
          } else if (zt === 'polygon') {
            if (polyPts.length >= 2) {
              const ll = polyPts.map(p => [p[1], p[0]]);
              if (ll.length >= 3) L.polygon(ll, { color: '#2563EB', fillColor: '#3B82F6', fillOpacity: 0.22, weight: 2.5 }).addTo(lg);
              else L.polyline(ll, { color: '#2563EB', weight: 2.5, dashArray: '5, 4' }).addTo(lg);
            }
            if (statusEl) statusEl.textContent = `Polygon vertices: ${polyPts.length} (click 3+ points on map)`;
          }
        };
        redraw();

        map.on('click', ev => {
          const lat = round5(ev.latlng.lat), lng = round5(ev.latlng.lng);
          const zt = (shapeSel && shapeSel.value) || 'circle';
          const wtcHub = getCompanyHub('WTC', SEED);
          if (zt === 'circle') {
            if (cLatInp) cLatInp.value = String(lat);
            if (cLngInp) cLngInp.value = String(lng);
            if (gjInp) gjInp.value = '';
            if (distInp && !distInp.value) distInp.value = String(Math.round(roadAdjustedKm(wtcHub.lat, wtcHub.lng, lat, lng)));
          } else if (zt === 'polygon') {
            polyPts.push([lng, lat]);
            if (polyPts.length >= 3) {
              const ring = polyPts.concat([[polyPts[0][0], polyPts[0][1]]]);
              if (gjInp) gjInp.value = JSON.stringify({ type: 'Polygon', coordinates: [ring] });
              const lats = ring.map(p => p[1]), lngs = ring.map(p => p[0]);
              const cLat = round5((Math.min(...lats) + Math.max(...lats)) / 2);
              const cLng = round5((Math.min(...lngs) + Math.max(...lngs)) / 2);
              if (cLatInp) cLatInp.value = String(cLat);
              if (cLngInp) cLngInp.value = String(cLng);
              if (distInp && !distInp.value) distInp.value = String(Math.round(roadAdjustedKm(wtcHub.lat, wtcHub.lng, cLat, cLng)));
            }
          }
          redraw();
        });

        if (shapeSel) shapeSel.addEventListener('change', () => { polyPts = []; redraw(); });
        if (radInp) radInp.addEventListener('input', redraw);
        const clearBtn = hostEl.querySelector('#modalRegionClearPtsBtn');
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            polyPts = [];
            if (gjInp) gjInp.value = '';
            if (cLatInp) cLatInp.value = '';
            if (cLngInp) cLngInp.value = '';
            redraw();
          });
        }
      }).catch(() => {});
    }
  }

  // ==================== INLINE TICKET ROUTE MINI-MAP (#originMiniMapCanvas) ====================
  const _ticketOriginMini = { map: null, layers: null, canvas: null, lastStamp: '', callbacks: null };

  function cleanupTicketOriginMiniMap() {
    if (_ticketOriginMini.map) {
      try { _ticketOriginMini.map.remove(); } catch (_) {}
    }
    _ticketOriginMini.map = null;
    _ticketOriginMini.layers = null;
    _ticketOriginMini.canvas = null;
    _ticketOriginMini.lastStamp = '';
    _ticketOriginMini.callbacks = null;
  }

  function renderTicketOriginMiniLayers(L, SEED, STATE, spec) {
    const map = _ticketOriginMini.map;
    if (!map) return;
    if (_ticketOriginMini.layers) {
      _ticketOriginMini.layers.clearLayers();
    } else {
      _ticketOriginMini.layers = L.layerGroup().addTo(map);
    }
    const lg = _ticketOriginMini.layers;
    hydrateSeedGeo(SEED);

    const regions = ((SEED && SEED.records && SEED.records.regions) || []).filter(r => r && !r.voided);
    regions.forEach(r => {
      if (r.zone_type === 'circle' && r.center_lat != null && r.radius_km > 0) {
        L.circle([Number(r.center_lat), Number(r.center_lng)], {
          radius: Number(r.radius_km) * 1000,
          color: '#0D9488',
          fillColor: '#10B981',
          fillOpacity: 0.08,
          weight: 1.2
        }).addTo(lg);
      } else if (r.zone_geojson) {
        const gj = parseZoneGeoJson(r.zone_geojson);
        if (gj) L.geoJSON(gj, { style: { color: '#2563EB', fillColor: '#3B82F6', fillOpacity: 0.06, weight: 1.1 } }).addTo(lg);
      }
    });

    const fromSpec = spec.fromSpec;
    const toSpec = spec.toSpec;
    const est = (fromSpec && fromSpec.name && toSpec && toSpec.name)
      ? estimateLegKm(fromSpec, toSpec, SEED, {
          onAsyncRoute: () => {
            _ticketOriginMini.lastStamp = '';
            if (_ticketOriginMini.callbacks && typeof _ticketOriginMini.callbacks.onRouteResolved === 'function') {
              _ticketOriginMini.callbacks.onRouteResolved();
            }
          }
        })
      : null;

    if (est && est.fromCoord && est.toCoord && est.fromCoord.lat != null && est.toCoord.lat != null && est.oneWayKm > 0) {
      const latlngs = Array.isArray(est.routeCoords) && est.routeCoords.length > 1
        ? est.routeCoords.map(pt => [pt[1], pt[0]])
        : [[est.fromCoord.lat, est.fromCoord.lng], [est.toCoord.lat, est.toCoord.lng]];
      L.polyline(latlngs, { color: '#FFFFFF', weight: 6, opacity: 0.85 }).addTo(lg);
      L.polyline(latlngs, {
        color: '#1D4ED8',
        weight: 3.2,
        dashArray: Array.isArray(est.routeCoords) ? null : '6, 5',
        opacity: 0.95
      }).addTo(lg);
    }

    const siteStats = getUnifiedSiteStats(SEED, STATE);
    const activeFromNorm = fromSpec && fromSpec.type === 'site' ? norm(fromSpec.name) : '';
    const activeToNorm = toSpec && toSpec.type === 'site' ? norm(toSpec.name) : '';
    const sites = ((SEED && SEED.records && SEED.records.sites) || []).filter(s => s && !s.voided && s.latitude != null && s.longitude != null);

    // Show top frequent sites + active origin/destination sites cleanly
    sites.forEach(s => {
      const nk = norm(s.name);
      const isFrom = nk && nk === activeFromNorm;
      const isTo = nk && nk === activeToNorm;
      const st = siteStats.byNorm.get(nk) || { total: 0 };
      if (!isFrom && !isTo && st.total < 80) return;
      const lat = Number(s.latitude), lng = Number(s.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const pinColor = isFrom ? '#2563EB' : (isTo ? '#059669' : '#64748B');
      const showLbl = isFrom || isTo;
      const m = L.marker([lat, lng], {
        icon: makeSvgPinIcon(L, pinColor, showLbl ? s.name : '', false),
        zIndexOffset: (isFrom || isTo) ? 750 : 100
      }).addTo(lg);
      if (m.bindTooltip && !showLbl) {
        m.bindTooltip(esc(s.name), { className: 'geo-zone-tooltip', direction: 'top' });
      }
      m.on('click', ev => {
        L.DomEvent.stopPropagation(ev);
        if (_ticketOriginMini.callbacks && typeof _ticketOriginMini.callbacks.onPickSite === 'function') {
          _ticketOriginMini.callbacks.onPickSite(s.name);
        }
      });
    });

    getAllCompanyHubs(SEED).forEach(h => {
      const isActiveBu = Boolean(fromSpec && fromSpec.type === 'bu' && norm(fromSpec.name) === norm(h.name));
      const m = L.marker([h.lat, h.lng], {
        icon: makeSvgPinIcon(L, isActiveBu ? '#059669' : '#D9A54A', isActiveBu ? h.name : '', true),
        zIndexOffset: isActiveBu ? 950 : 850
      }).addTo(lg);
      if (m.bindTooltip && !isActiveBu) {
        m.bindTooltip(`${esc(h.name)} Hub`, { className: 'geo-zone-tooltip', direction: 'top' });
      }
      m.on('click', ev => {
        L.DomEvent.stopPropagation(ev);
        if (_ticketOriginMini.callbacks && typeof _ticketOriginMini.callbacks.onPickBu === 'function') {
          _ticketOriginMini.callbacks.onPickBu(h.name);
        }
      });
    });

    const cFrom = fromSpec ? resolveEndpointCoord(fromSpec, SEED) : null;
    const cTo = toSpec ? resolveEndpointCoord(toSpec, SEED) : null;
    if (cFrom && cFrom.lat != null && cTo && cTo.lat != null && (Math.abs(cFrom.lat - cTo.lat) > 0.0005 || Math.abs(cFrom.lng - cTo.lng) > 0.0005)) {
      const b = L.latLngBounds([[cFrom.lat, cFrom.lng], [cTo.lat, cTo.lng]]);
      map.fitBounds(b, { padding: [28, 28], maxZoom: 13, animate: false });
    } else if (cFrom && cFrom.lat != null) {
      map.setView([cFrom.lat, cFrom.lng], 11, { animate: false });
    } else {
      map.setView([33.83, 35.50], 10, { animate: false });
    }
  }

  function wireTicketOriginMiniMap(canvasEl, opts = {}) {
    if (!canvasEl) return;
    const { SEED, STATE, fromSpec, toSpec } = opts;
    _ticketOriginMini.callbacks = opts;
    const stamp = `${fromSpec ? fromSpec.type + ':' + norm(fromSpec.name) : ''}|${toSpec ? toSpec.type + ':' + norm(toSpec.name) : ''}|${SEED ? (SEED._customRev || 0) : 0}|${GEO_STORE.updatedAt || ''}`;

    ensureLeaflet().then(L => {
      if (!canvasEl.isConnected) return;
      if (_ticketOriginMini.map && _ticketOriginMini.canvas === canvasEl) {
        if (_ticketOriginMini.lastStamp !== stamp) {
          _ticketOriginMini.lastStamp = stamp;
          renderTicketOriginMiniLayers(L, SEED, STATE, { fromSpec, toSpec });
        }
        setTimeout(() => { try { _ticketOriginMini.map && _ticketOriginMini.map.invalidateSize(); } catch (_) {} }, 25);
        return;
      }
      cleanupTicketOriginMiniMap();
      const map = L.map(canvasEl, { zoomControl: true, attributionControl: false }).setView([33.83, 35.50], 10);
      canvasEl.querySelectorAll('[title]').forEach(el => el.removeAttribute('title'));
      _ticketOriginMini.map = map;
      _ticketOriginMini.canvas = canvasEl;
      _ticketOriginMini.lastStamp = stamp;
      addBaseTiles(L, map);
      renderTicketOriginMiniLayers(L, SEED, STATE, { fromSpec, toSpec });
      setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 40);

      map.on('click', ev => {
        const cb = _ticketOriginMini.callbacks;
        if (cb && typeof cb.onClickMapCoord === 'function') {
          cb.onClickMapCoord(round5(ev.latlng.lat), round5(ev.latlng.lng));
        }
      });
    }).catch(() => {});
  }

  function jumpToMapRegionOrSite(opts = {}) {
    STUDIO.collapsed = false;
    STUDIO._userPanned = false;
    if (opts.region) STUDIO.selectedRegion = opts.region;
    if (opts.site) {
      STUDIO.distTo = `site:${opts.site}`;
      const sites = (window.MFG_SEED && window.MFG_SEED.records && window.MFG_SEED.records.sites) || [];
      const sRow = sites.find(s => s && norm(s.name) === norm(opts.site));
      if (sRow && sRow.region && !opts.region) STUDIO.selectedRegion = sRow.region;
    }
    if (opts.bu) {
      STUDIO.distFrom = `bu:${opts.bu}`;
    }
  }

  window.MFG_GEO = {
    BU_LIST,
    STUDIO,
    hydrateSeedGeo,
    exportGeoConfig,
    importGeoConfig,
    getCompanyHub,
    getAllCompanyHubs,
    setCompanyHubPin,
    haversineKm,
    roadAdjustedKm,
    isPointInRegion,
    findContainingRegion,
    estimateLegKm,
    setPairKmOverride,
    getUnifiedSiteStats,
    getUnifiedSiteMetaItems,
    getSiteLast24hTickets,
    collectAllRecentTickets24h,
    parsePastedCoordinates,
    persistRegionZone,
    persistLocationPin,
    renderGeoStudioHtml,
    wireGeoStudio,
    wireModalSiteOrRegionMap,
    wireTicketOriginMiniMap,
    cleanupTicketOriginMiniMap,
    jumpToMapRegionOrSite
  };
})();
