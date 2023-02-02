require([
        "esri/config",
        "esri/views/MapView",
        "esri/WebMap",
        "esri/widgets/Legend",
        "esri/widgets/Expand",
        "esri/widgets/Bookmarks",
        "esri/core/lang",
        "esri/core/promiseUtils",
        "esri/core/reactiveUtils"
      ], (
        esriConfig,
        MapView,
        WebMap,
        Legend,
        Expand,
        Bookmarks,
        lang,
        promiseUtils,
        reactiveUtils
      ) => {
        esriConfig.apiKey = "AAPKc0b5b552c4324dc29a90351172d2b735eM1eJrecMDQYEQZi4rnGIPsjY_Llxx1p0nXXbkHOEsxXmYiO6lqTiBkAGXsSplrm";
        //Declarar variables de gráfico para actualizar a medida que interactúa con la muestra
        let yearChart,
          ageChart,
          dispositionChart,
          genderChart,
          raceChart,
          totalNumber,
          avgAge,
          avgOpenTime;

        //cargar un mapa web que contenga estadísticas de homicidios
        // from a portal item
        const webmap = new WebMap({
          portalItem: {
            id: "96cf806c32874026bef5f586315f098c"
          }
        });
        //agregar la vista del mapa
        const view = new MapView({
          map: webmap,
          container: "viewDiv",
          constraints: {
            minScale: 300000
          },
          highlightOptions: {
            color: "black",
            haloOpacity: 0.65,
            fillOpacity: 0.45
          }
        });

        //Agregar elementos de la interfaz de usuario a la vista
        // Muestra instrucciones al usuario para entender la muestra
        // Y los coloca en una instancia de widget Expandir
        //crear un widget expand que tenga informacion sobre los datos estadisticos de la app
        const titleContent = document.createElement("div");
        titleContent.style.padding = "15px";
        titleContent.style.backgroundColor = "white";
        titleContent.style.width = "500px";
        titleContent.innerHTML = [
          "<div id='title' class='esri-widget'>",
          "<span id='num-homicides'>0</span> los homicidios ocurrieron dentro de una milla de la ubicación del puntero en los últimos 10 años.",
          "La edad promedio de las víctimas es <span id='avg-age'>0</span>. El tiempo promedio que lleva un caso sin resolver",
          "abierto es de <span id='avg-open-time'>0</span>años.",
          "</div>"
        ].join(" ");

        //creamos el new expand donde le agregaremos el titleContent
        const titleExpand = new Expand({
          expandIconClass: "esri-icon-dashboard",
          expandTooltip: "Summary stats",
          view: view,
          content: titleContent,
          expanded: view.widthBreakpoint !== "xsmall"
        });
        //agregamos el expand al mapa 
        view.ui.add(titleExpand, "top-right");
        //agregamos un nuevo expand que contenga la leyenda del mapa
        const legendExpand = new Expand({
          view: view,
          content: new Legend({
            view: view
          }),
          expanded: view.widthBreakpoint !== "xsmall"
        });
        //agregamos el expand con la leyenda
        view.ui.add(legendExpand, "bottom-left");
        //cada vez que hagamos una interaccion con el webmap usaremos watch
        //crearemos la funcion que evalue si el punto de quiebre del div es muy pequeno desaparece
        view.watch("widthBreakpoint", (newValue) => {
          titleExpand.expanded = newValue !== "xsmall";
          legendExpand.expanded = newValue !== "xsmall";
        });
        //agregamos un new bookmarks automaticamente agarrara los bookmarks del mapa
        const bookmarksWidget = new Bookmarks({
          view: view
        });
        //creamos un nuevo expand que tendra el new bookmarks
        const bookmarksExpand = new Expand({
          view: view,
          content: bookmarksWidget
        });
        //agregamos el expand bookmarks al mapa
        view.ui.add(bookmarksExpand, "top-right");
        //registraremos un evento al widget bookmarks
        bookmarksWidget.on("select-bookmark", (event) => {
          bookmarksExpand.expanded = false;
        });

        // Muestra instrucciones al usuario para entender la muestra
        // Y los coloca en una instancia de widget Expandir
        const sampleInstructions = document.createElement("div");
        sampleInstructions.style.padding = "10px";
        sampleInstructions.style.backgroundColor = "white";
        sampleInstructions.style.width = "300px";
        sampleInstructions.innerHTML = [
          "<b>Arrastra</b> el puntero sobre los datos para ver las estadísticas",
          "dentro de un area de una milla de la ubicación del puntero."
        ].join(" ");
        //expand que contiene el div de la informacion de la app
        const instructionsExpand = new Expand({
          expandIconClass: "esri-icon-question",
          expandTooltip: "Como usar esta APP",
          view: view,
          content: sampleInstructions
        });
        //agregarlos al mapa 
        view.ui.add(instructionsExpand, "top-left");
        //funcion para definir como se resaltaran las entidades cuando se seleccionan
        let highlightHandle = null;
        /**
         * Cree gráficos y comience a consultar la vista de capa cuando
         * la vista está lista y los datos comienzan a dibujarse en la vista
         */
        //cuando se visualize el mapa se realizara las siguientes instrucciones
        view.when().then(() => {
          // Crear los graficos cuando la vista del mapa este lista
          createCharts();
          //layer sera la capa del mapa 
          const layer = webmap.layers.getItemAt(0);
          //arrelo de los atributos de salida de la capa
          layer.outFields = [
            "victim_age_years",
            "victim_race",
            "victim_sex",
            "reported_year",
            "disposition",
            "milliseconds"
          ];
          //cuando en la vista del mapa se visualize el mapa 
          //usaremos el metodo whenLayerView que tomara de parametro la capa
          //esta realizara una funcion que regresara la entidad 
          view.whenLayerView(layer).then((layerView) => {
            //reactiveUtils proporcionar capacidades para observar 
            //cambios en el estado de las propiedades de la API, y
            // es una parte importante de la administración del ciclo
            // de vida de la aplicación.
            reactiveUtils
              .whenOnce(() => !layerView.updating)
              .then(() => {
                // Query layer view statistics as the user clicks
                // or drags the pointer across the view.
                view.on(["click", "drag"], (event) => {
                  // disables navigation by pointer drag
                  event.stopPropagation();
                  queryStatsOnDrag(layerView, event)
                    .then(updateCharts)
                    .catch((error) => {
                      if (error.name !== "AbortError") {
                        console.error(error);
                      }
                    });
                });
              });
          });
        });

        /**
         * Queries statistics against the layer view at the given screen location
         */
        const queryStatsOnDrag = promiseUtils.debounce((layerView, event) => {
          // create a query object for the highlight and the statistics query

          const query = layerView.layer.createQuery();
          query.geometry = view.toMap(event); // converts the screen point to a map point
          query.distance = 1; // queries all features within 1 mile of the point
          query.units = "miles";

          const statsQuery = query.clone();

          // date used to calculate the average time a case has been opened

          const dataDownloadDate = Date.UTC(2018, 6, 5);

          // Create the statistic definitions for querying stats from the layer view
          // the `onStatisticField` property can reference a field name or a SQL expression
          // `outStatisticFieldName` is the name of the statistic you will reference in the result
          // `statisticType` can be sum, avg, min, max, count, stddev
          const statDefinitions = [
            // Age of crime since it was reported in years

            {
              onStatisticField:
                "(" +
                dataDownloadDate +
                " - milliseconds) / (1000 * 60 * 60 * 24 * 365.25)",
              outStatisticFieldName: "avg_open_time_years",
              statisticType: "avg"
            },

            // total homicides

            {
              onStatisticField: "1",
              outStatisticFieldName: "total",
              statisticType: "count"
            },

            // total homicides by year
            //
            // Since separate fields don't exist for each year, we can use
            // an expression to return a 1 or a 0 for each year and sum up the
            // results to get the total.

            {
              onStatisticField:
                "CASE WHEN reported_year = 2008 THEN 1 ELSE 0 END",
              outStatisticFieldName: "total_2008",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN reported_year = 2009 THEN 1 ELSE 0 END",
              outStatisticFieldName: "total_2009",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN reported_year = 2010 THEN 1 ELSE 0 END",
              outStatisticFieldName: "total_2010",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN reported_year = 2011 THEN 1 ELSE 0 END",
              outStatisticFieldName: "total_2011",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN reported_year = 2012 THEN 1 ELSE 0 END",
              outStatisticFieldName: "total_2012",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN reported_year = 2013 THEN 1 ELSE 0 END",
              outStatisticFieldName: "total_2013",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN reported_year = 2014 THEN 1 ELSE 0 END",
              outStatisticFieldName: "total_2014",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN reported_year = 2015 THEN 1 ELSE 0 END",
              outStatisticFieldName: "total_2015",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN reported_year = 2016 THEN 1 ELSE 0 END",
              outStatisticFieldName: "total_2016",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN reported_year = 2017 THEN 1 ELSE 0 END",
              outStatisticFieldName: "total_2017",
              statisticType: "sum"
            },

            // crime disposition (aka crime statu)
            //
            // Since this is a string field, we can use a similar technique to sum
            // the total of each status of the crime

            {
              onStatisticField:
                "CASE WHEN disposition = 'Closed by arrest' THEN 1 ELSE 0 END",
              outStatisticFieldName: "num_closed_arrest",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN disposition = 'Open/No arrest' THEN 1 ELSE 0 END",
              outStatisticFieldName: "num_open",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN disposition = 'Closed without arrest' THEN 1 ELSE 0 END",
              outStatisticFieldName: "num_closed_no_arrest",
              statisticType: "sum"
            },

            // average victim age
            //
            // Some victim ages are unknown and indicated with a -99. We'll
            // use an expression to treat those unknown ages as 0. This will
            // skew the average age slightly downward since we can't exclude those
            // values without a where clause. Do use a where clause, we could execute
            // a separate query

            {
              onStatisticField:
                "CASE WHEN victim_age_years = -99 THEN 0 ELSE victim_age_years END",
              outStatisticFieldName: "avg_age",
              statisticType: "avg"
            },

            // victim age brackets

            {
              onStatisticField:
                "CASE WHEN victim_age_years = -99 THEN 1 ELSE 0 END",
              outStatisticFieldName: "age_unknown",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN victim_age_years >= 0 AND victim_age_years <= 18 THEN 1 ELSE 0 END",
              outStatisticFieldName: "age_18_under",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN victim_age_years >= 19 AND victim_age_years <= 30 THEN 1 ELSE 0 END",
              outStatisticFieldName: "age_19_30",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN victim_age_years >= 31 AND victim_age_years <= 44 THEN 1 ELSE 0 END",
              outStatisticFieldName: "age_31_44",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN victim_age_years >= 45 AND victim_age_years <= 65 THEN 1 ELSE 0 END",
              outStatisticFieldName: "age_45_64",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN victim_age_years >= 65 THEN 1 ELSE 0 END",
              outStatisticFieldName: "age_65_over",
              statisticType: "sum"
            },

            // victim gender

            {
              onStatisticField:
                "CASE WHEN victim_sex = 'Male' THEN 1 ELSE 0 END",
              outStatisticFieldName: "num_males",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN victim_sex = 'Female' THEN 1 ELSE 0 END",
              outStatisticFieldName: "num_females",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN victim_sex = 'Unknown' THEN 1 ELSE 0 END",
              outStatisticFieldName: "num_unknown_gender",
              statisticType: "sum"
            },

            // victim race

            {
              onStatisticField:
                "CASE WHEN victim_race = 'Asian' THEN 1 ELSE 0 END",
              outStatisticFieldName: "num_asian",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN victim_race = 'Black' THEN 1 ELSE 0 END",
              outStatisticFieldName: "num_black",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN victim_race = 'Hispanic' THEN 1 ELSE 0 END",
              outStatisticFieldName: "num_hispanic",
              statisticType: "sum"
            },
            {
              onStatisticField:
                "CASE WHEN victim_race = 'White' THEN 1 ELSE 0 END",
              outStatisticFieldName: "num_white",
              statisticType: "sum"
            }
          ];

          // add the stat definitions to the the statistics query object cloned earlier
          statsQuery.outStatistics = statDefinitions;

          // execute the query for all features in the layer view
          const allStatsResponse = layerView.queryFeatures(statsQuery).then(
            (response) => {
              const stats = response.features[0].attributes;
              return stats;
            },
            (e) => {
              console.error(e);
            }
          );

          const openStatsQuery = statsQuery.clone();
          openStatsQuery.where = "disposition = 'Open/No arrest'";

          // execute the query for only unsolved homicides in the layer view
          const unsolvedStatsResponse = layerView
            .queryFeatures(openStatsQuery)
            .then(
              (response) => {
                const stats = response.features[0].attributes;
                return stats;
              },
              (e) => {
                console.error(e);
              }
            );

          // highlight all features within the query distance
          layerView.queryObjectIds(query).then((ids) => {
            if (highlightHandle) {
              highlightHandle.remove();
              highlightHandle = null;
            }
            highlightHandle = layerView.highlight(ids);
          });

          // Return the promises that will resolve to each set of statistics
          return promiseUtils.eachAlways([
            allStatsResponse,
            unsolvedStatsResponse
          ]);
        });

        /**
         * Updates the charts with the data returned from the statistic queries.
         */
        function updateCharts(responses) {
          const allStats = responses[0].value;
          const unsolvedStats = responses[1].value;

          const yearChartStats = {
            solved: [
              allStats.total_2008 - unsolvedStats.total_2008,
              allStats.total_2009 - unsolvedStats.total_2009,
              allStats.total_2010 - unsolvedStats.total_2010,
              allStats.total_2011 - unsolvedStats.total_2011,
              allStats.total_2012 - unsolvedStats.total_2012,
              allStats.total_2013 - unsolvedStats.total_2013,
              allStats.total_2014 - unsolvedStats.total_2014,
              allStats.total_2015 - unsolvedStats.total_2015,
              allStats.total_2016 - unsolvedStats.total_2016,
              allStats.total_2017 - unsolvedStats.total_2017
            ],
            unsolved: [
              unsolvedStats.total_2008,
              unsolvedStats.total_2009,
              unsolvedStats.total_2010,
              unsolvedStats.total_2011,
              unsolvedStats.total_2012,
              unsolvedStats.total_2013,
              unsolvedStats.total_2014,
              unsolvedStats.total_2015,
              unsolvedStats.total_2016,
              unsolvedStats.total_2017
            ]
          };
          updateChart(yearChart, yearChartStats);

          const ageChartStats = {
            solved: [
              allStats.age_65_over - unsolvedStats.age_65_over,
              allStats.age_45_64 - unsolvedStats.age_45_64,
              allStats.age_31_44 - unsolvedStats.age_31_44,
              allStats.age_19_30 - unsolvedStats.age_19_30,
              allStats.age_18_under - unsolvedStats.age_18_under,
              allStats.age_unknown - unsolvedStats.age_unknown
            ],
            unsolved: [
              unsolvedStats.age_65_over,
              unsolvedStats.age_45_64,
              unsolvedStats.age_31_44,
              unsolvedStats.age_19_30,
              unsolvedStats.age_18_under,
              unsolvedStats.age_unknown
            ]
          };
          updateChart(ageChart, ageChartStats);

          const dispositionStats = [
            allStats.num_closed_arrest,
            allStats.num_closed_no_arrest,
            allStats.num_open
          ];
          updateChart(dispositionChart, dispositionStats);

          const genderStats = [
            allStats.num_males - unsolvedStats.num_males,
            unsolvedStats.num_males,
            allStats.num_females - unsolvedStats.num_females,
            unsolvedStats.num_females
          ];
          updateChart(genderChart, genderStats);

          const raceStats = [
            allStats.num_asian - unsolvedStats.num_asian,
            unsolvedStats.num_asian,
            allStats.num_black - unsolvedStats.num_black,
            unsolvedStats.num_black,
            allStats.num_hispanic - unsolvedStats.num_hispanic,
            unsolvedStats.num_hispanic,
            allStats.num_white - unsolvedStats.num_white,
            unsolvedStats.num_white
          ];
          updateChart(raceChart, raceStats);

          // Update the total numbers in the title UI element
          avgAge.innerHTML = Math.round(allStats.avg_age);
          totalNumber.innerHTML = allStats.total;
          avgOpenTime.innerHTML = unsolvedStats.avg_open_time_years.toFixed(1);
        }

        /**
         * Updates the given chart with new data
         */
        function updateChart(chart, dataValues) {
          if (chart.config.type === "doughnut") {
            chart.data.datasets[0].data = dataValues;
          } else {
            chart.data.datasets[0].data = dataValues.solved;
            chart.data.datasets[1].data = dataValues.unsolved;
          }
          chart.update();
        }

        /**
         * Creates 5 charts for summarizing homicide data
         */
        function createCharts() {
          totalNumber = document.getElementById("num-homicides");
          avgAge = document.getElementById("avg-age");
          avgOpenTime = document.getElementById("avg-open-time");

          const yearCanvas = document.getElementById("year-chart");
          yearChart = new Chart(yearCanvas.getContext("2d"), {
            type: "bar",
            data: {
              labels: [
                "2008",
                "2009",
                "2010",
                "2011",
                "2012",
                "2013",
                "2014",
                "2015",
                "2016",
                "2017"
              ],
              datasets: [
                {
                  label: "Solved by 2017",
                  backgroundColor: "#149dcf",
                  stack: "Stack 0",
                  data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
                },
                {
                  label: "Remains unsolved",
                  backgroundColor: "#ed5050",
                  stack: "Stack 0",
                  data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
                }
              ]
            },
            options: {
              responsive: false,
              legend: {
                position: "top"
              },
              title: {
                display: true,
                text: "Homicides by year"
              },
              scales: {
                xAxes: [
                  {
                    stacked: true
                  }
                ],
                yAxes: [
                  {
                    stacked: true,
                    ticks: {
                      beginAtZero: true
                    }
                  }
                ]
              }
            }
          });

          const ageCanvas = document.getElementById("age-chart");
          ageChart = new Chart(ageCanvas.getContext("2d"), {
            type: "horizontalBar",
            data: {
              labels: ["65+", "45-64", "31-44", "18-30", "0-18", "Not sure"],
              datasets: [
                {
                  label: "Solved by 2017",
                  backgroundColor: "#149dcf",
                  stack: "Stack 0",
                  data: [0, 0, 0, 0, 0, 0]
                },
                {
                  label: "Remains unsolved",
                  backgroundColor: "#ed5050",
                  stack: "Stack 0",
                  data: [0, 0, 0, 0, 0, 0]
                }
              ]
            },
            options: {
              responsive: false,
              legend: {
                position: "top"
              },
              title: {
                display: true,
                text: "Homicides by age"
              },
              scales: {
                xAxes: [
                  {
                    stacked: true,
                    ticks: {
                      beginAtZero: true
                    }
                  }
                ],
                yAxes: [
                  {
                    stacked: true
                  }
                ]
              }
            }
          });

          const dispositionCanvas =
            document.getElementById("disposition-chart");
          dispositionChart = new Chart(dispositionCanvas.getContext("2d"), {
            type: "doughnut",
            data: {
              labels: [
                "Closed by arrest",
                "Closed without arrest",
                "Open/No arrest"
              ],
              datasets: [
                {
                  backgroundColor: ["#149dcf", "#a6c736", "#ed5050"],
                  borderColor: "rgb(255, 255, 255)",
                  borderWidth: 1,
                  data: [0, 0, 0]
                }
              ]
            },
            options: {
              responsive: false,
              cutoutPercentage: 35,
              legend: {
                position: "bottom"
              },
              title: {
                display: true,
                text: "Status of the case"
              }
            }
          });

          const genderCanvas = document.getElementById("gender-chart");
          genderChart = new Chart(genderCanvas.getContext("2d"), {
            type: "doughnut",
            data: {
              labels: [
                "Male (solved)",
                "Male (unsolved)",
                "Female (solved)",
                "Female (unsolved)"
              ],
              datasets: [
                {
                  backgroundColor: ["#149dcf", "#0a4d66", "#ed5050", "#7c2525"],
                  borderColor: "rgb(255, 255, 255)",
                  borderWidth: 1,
                  data: [0, 0, 0, 0]
                }
              ]
            },
            options: {
              responsive: false,
              cutoutPercentage: 35,
              legend: {
                position: "bottom"
              },
              title: {
                display: true,
                text: "Gender of the victim"
              }
            }
          });

          const raceCanvas = document.getElementById("race-chart");
          raceChart = new Chart(raceCanvas.getContext("2d"), {
            type: "doughnut",
            data: {
              labels: [
                "Asian (solved)",
                "Asian (unsolved)",
                "Black (solved)",
                "Black (unsolved)",
                "Hispanic (solved)",
                "Hispanic (unsolved)",
                "White (solved)",
                "White (unsolved)"
              ],
              datasets: [
                {
                  backgroundColor: [
                    "#ed5050",
                    "#7c2525",
                    "#149dcf",
                    "#0a4d66",
                    "#a6c736",
                    "#52631a",
                    "#fc9220",
                    "#7c470d"
                  ],
                  borderColor: "rgb(255, 255, 255)",
                  borderWidth: 1,
                  data: [0, 0, 0, 0, 0, 0, 0, 0]
                }
              ]
            },
            options: {
              responsive: false,
              cutoutPercentage: 35,
              legend: {
                position: "bottom"
              },
              title: {
                display: true,
                text: "Race of the victim"
              }
            }
          });
        }
      });
