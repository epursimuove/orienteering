//
// Functionality for elaborating with data from WinSplits Online.
//

'use strict';

const orienteering = (() => {

    console.log('Initializing orienteering functionality...');

    const version = '1.3.0';
    const MISSING_TIME = -1;
    const NO_PLACE = -1;

    const toSeconds = hh_mm_ss => {
        // The formats from WinSplits Online are either "h:mm.ss" or "m.ss".

        if (hh_mm_ss === '') {
            return MISSING_TIME;
        }

        let hours = 0;
        let mm_ss = null;

        if (hh_mm_ss.includes(':')) {
            const hoursAndMinutesSeconds = hh_mm_ss.split(':');

            hours = Number.parseInt(hoursAndMinutesSeconds[0], 10);
            mm_ss = hoursAndMinutesSeconds[1];
        } else {
            mm_ss = hh_mm_ss;
        }

        const minutesAndSeconds = mm_ss.split('.');

        const minutes = Number.parseInt(minutesAndSeconds[0], 10);
        const seconds = Number.parseInt(minutesAndSeconds[1], 10);

        const totalSeconds = hours * 3600 + minutes * 60 + seconds;

        return totalSeconds;
    };

    const zeroPad = n => (n < 10 ? '0' : '') + n;

    const formatTime = (totalSeconds, minimum = 'seconds', doubleDigits = false) => {

        let result = '';

        if (totalSeconds === MISSING_TIME) {
            return '';
        }

        let rest = totalSeconds;

        const mandatoryHours = minimum === 'hours';
        const mandatoryMinutes = mandatoryHours || minimum === 'minutes';

        if (mandatoryHours || rest >= 3600) {
            const hours = Math.floor(rest / 3600);
            rest -= hours * 3600;
            result += doubleDigits || result.length > 0 ? `${zeroPad(hours)}:` : `${hours}:`;
            // result += `${hours}:`;
        }
        if (mandatoryMinutes || rest >= 60 || result.length > 0) {
            const minutes = Math.floor(rest / 60);
            rest -= minutes * 60;
            result += doubleDigits || result.length > 0 ? `${zeroPad(minutes)}:` : `${minutes}:`;
        }
        result += doubleDigits || result.length > 0 ? zeroPad(rest) : rest;

        return result;
    };

    const createPerformanceContainer = () => {
        return {
            originalTime: null, // Format 'hh:mm.ss'.
            relativeTime: null,
            relativeTimeInSeconds: null,
            relativeTimeMinimized: null,
            actualTimeMinimized: null,
            place: null
        };
    };

    const createEmptyControl = (n = 999) => {
        return {
            // control: n === 999 ? 'Finish' : 'Control ' + n,
            control: n === 999 ? 'Finish' : n,
            leg: createPerformanceContainer(),
            split: createPerformanceContainer()
        };
    };

    const createEmptyControls = numberOfControls => {
        const controls = [];

        // controls.push('Start');

        for (let control = 1; control <= numberOfControls; control++) {
            controls.push(createEmptyControl(control));
        }
        controls.push(createEmptyControl()); // Finish.

        return controls;
    };

    const createControlLabels = numberOfControls => {
        const controls = [];

        controls.push('Start');

        for (let control = 1; control <= numberOfControls; control++) {
            controls.push(`Control ${control}`);
        }

        controls.push('Finish');
        // controls[controls.length - 1] = 'Finish'; // Rename last control to 'Finish'.
        return controls;
    };

    const getPlace = placeStr => placeStr === '' ? NO_PLACE : parseInt(placeStr.substring(1, placeStr.length - 1), 10); // '(12)' => 12.

    const nextPart = (parseWrapper) => parseWrapper.parts[parseWrapper.index++];

    const extractTimeInformationForAthlete = (parseWrapper) => (type) => {

        // Loop all controls plus finish.
        for (let control = 1; control <= parseWrapper.numberOfControls + 1; control++) {
            const currentControl = parseWrapper.athlete.controls[control - 1];
            const legOrSplit = currentControl[type];
            const relativeTime = nextPart(parseWrapper);
            const place = getPlace(nextPart(parseWrapper));

            legOrSplit.originalTime = relativeTime;
            legOrSplit.relativeTime = relativeTime;
            legOrSplit.place = place;
            legOrSplit.relativeTimeInSeconds =
                place === 1 ? 0 : toSeconds(relativeTime);

            if (place === 1) {
                parseWrapper.orienteeringData.best[type].timesOriginal[control - 1] = relativeTime;
                parseWrapper.orienteeringData.best[type].times[control - 1] = formatTime(toSeconds(relativeTime), 'minutes');
                parseWrapper.orienteeringData.best[type].timesInSeconds[control - 1] = toSeconds(relativeTime);
            }
        }

        parseWrapper.athlete[type].relativeTimes = parseWrapper.athlete.controls.map(control => control[type].relativeTime);
        parseWrapper.athlete[type].relativeTimesInSeconds = parseWrapper.athlete.controls.map(control => control[type].relativeTimeInSeconds);
        parseWrapper.athlete[type].places = parseWrapper.athlete.controls.map(control => control[type].place);
    };

    const parseSplitTimesExportedAsText = rawData => {

        // Notes 2020-06-06.
        //
        // Make sure the checkboxes for "relative split times" and "relative total times" are checked,
        // before "export the split times in text format".
        //
        // Formats for WinSplits exported text files are as follows for every two lines:
        // Pos<tab>Name<tab>Finish time<tab>Diff<tab><Start-Controls-Finish><tab>Name<tab><newline>
        // <tab>Club<tab><tab><tab><Start-Controls-Finish><tab>Club<tab><newline>

        console.log('Parsing WinSplits Online exported data...');

        const orienteeringData = {
            numberOfParticipants: 0,
            numberOfControls: 0,
            controlLabels: [],
            best: { // Per control and 'Finish', i.e. length is numberOfControls + 1.
                leg: {
                    timesOriginal: [],
                    times: [],
                    timesInSeconds: [],
                },
                split: {
                    timesOriginal: [],
                    times: [],
                    timesInSeconds: [],
                },
            },
            secondBest: {
                leg: {
                    relativeTimesInSeconds: []
                },
                split: {
                    relativeTimesInSeconds: []
                }
            },
            aggregated: { // Per athlete, i.e. length is numberOfAthletes.
                names: [],
                place: {
                    legFirstPlaces: [],
                    legSecondPlaces: [],
                    legThirdPlaces: [],
                    leg4_6Places: [],
                    leg7_12Places: [],
                },
                mistake: {
                    legNoMistakes: [],
                    legMinorMistakes: [],
                    legMajorMistakes: [],
                }
            },
        };

        const lines = rawData.split('\n');
        // console.log('lines.length', lines.length);

        let firstRowForAthlete = true;
        let athlete = null;
        const athletes = [];

        const parseWrapper = {
            orienteeringData,
            numberOfControls: null,
            parts: null,
            index: 0,
            athlete: null
        };

        let lineCount = 0;

        for (let line of lines) {
            // console.log('line', line);
            const parts = line.split('\t');
            // console.log('parts.length', parts.length);
            const numberOfControls = (parts.length - 8) / 2;
            // console.log('numberOfControls', numberOfControls);

            if (numberOfControls <= 0) {
                // console.log('Skipping row that contains no useful data');
                continue;
            }

            lineCount++;

            if (lineCount <= 2) {
                // console.log('Skipping header row');
                continue;
            }

            if (numberOfControls > 0 && orienteeringData.numberOfControls === 0) {
                // console.log('Found number of controls', numberOfControls);
                orienteeringData.numberOfControls = numberOfControls;
                orienteeringData.controlLabels = createControlLabels(numberOfControls);
                parseWrapper.numberOfControls = numberOfControls;
            }

            parseWrapper.parts = parts;

            // console.log('parts', parts);

            // let index = 0;

            if (firstRowForAthlete) {
                athlete = {
                    position: nextPart(parseWrapper),
                    name: nextPart(parseWrapper),
                    club: null,
                    totalTime: nextPart(parseWrapper),
                    diffTotalTime: nextPart(parseWrapper),
                    controls: createEmptyControls(numberOfControls),
                    leg: {
                        relativeTimes: [], // Original value read from WinSplits.
                        relativeTimesInSeconds: [],
                        relativeTimesMinimized: [], // Format: h:m:s.
                        places: [],
                        timesPercentages: []
                    },
                    split: {
                        relativeTimes: [], // Original value read from WinSplits.
                        relativeTimesInSeconds: [],
                        relativeTimesMinimized: [], // Format: h:m:s.
                        places: [],
                        timesPercentages: []
                    }
                };

                parseWrapper.athlete = athlete;

                extractTimeInformationForAthlete(parseWrapper)('leg');

            } else {
                parseWrapper.index++;
                athlete.club = nextPart(parseWrapper);
                parseWrapper.index += 2;

                extractTimeInformationForAthlete(parseWrapper)('split');
            }

            {
                // Sanity checks.

                const value = nextPart(parseWrapper);

                const correctStructure = parseWrapper.index === parts.length - 1;

                const correctHeadTailFirstRow = firstRowForAthlete && value === athlete.name;

                const correctHeadTailSecondRow = !firstRowForAthlete && value === athlete.club;

                if (!(correctStructure && (correctHeadTailFirstRow || correctHeadTailSecondRow))) {
                    console.log('MISMATCH!!!!');
                }
            }

            if (!firstRowForAthlete) {
                // console.log('athlete', athlete);

                {
                    // Fix original values.
                    athlete.position = athlete.position === '' ? NO_PLACE : parseInt(athlete.position, 10);
                    if (!['dsq', 'mp', 'dns'].includes(athlete.totalTime)) {
                        athlete.totalTime = formatTime(toSeconds(athlete.totalTime));
                    }
                    if (athlete.diffTotalTime !== '') {
                        athlete.diffTotalTime = '+' + formatTime(toSeconds(athlete.diffTotalTime), 'minutes');
                    }
                }

                athletes.push(athlete);
                athlete = null;
                orienteeringData.numberOfParticipants++;
            }

            firstRowForAthlete = !firstRowForAthlete;
            parseWrapper.index = 0;
        }



        orienteeringData.results = athletes;
        console.log('Parsing WinSplits Online exported data - DONE');

        return orienteeringData;
    };

    const isMistake = (bestLegTimesInSeconds, percentage) => (relativeLegTimeInSeconds, index) => {
        const bestLegTimeInSeconds = bestLegTimesInSeconds[index];
        const isMistake = relativeLegTimeInSeconds > (bestLegTimeInSeconds * percentage / 100);
        return isMistake;
    };

    const isWithinPercentage = (bestLegTimesInSeconds, minIncluded, maxExcluded) => (relativeLegTimeInSeconds, index) => {
        const bestLegTimeInSeconds = bestLegTimesInSeconds[index];
        const isWithin = relativeLegTimeInSeconds >= bestLegTimeInSeconds * minIncluded / 100 && relativeLegTimeInSeconds < bestLegTimeInSeconds * maxExcluded / 100;
        return isWithin;
    };

    const isAbovePercentage = (bestLegTimesInSeconds, minIncluded) => (relativeLegTimeInSeconds, index) => {
        const bestLegTimeInSeconds = bestLegTimesInSeconds[index];
        const isAbove = relativeLegTimeInSeconds >= bestLegTimeInSeconds * minIncluded / 100;
        return isAbove;
    };

    const roundToOneDecimal = x => Math.round( x * 10) / 10;

    const calculateMistakeInPercentage = (bestLegTimesInSeconds) => (relativeLegTimeInSeconds, index) => {
        const bestLegTimeInSeconds = bestLegTimesInSeconds[index];

        const percentage = roundToOneDecimal(relativeLegTimeInSeconds * 100 / bestLegTimeInSeconds);
        return percentage;
    };

    const enhanceOrienteeringDataForCharts = orienteeringData => {
        console.log('Enhancing data so it can be used together with charts...');

        const aggregated = orienteeringData.aggregated;
        const results = orienteeringData.results;

        const compareNumbers = (a, b) => {
            return a - b;
        };

        const sum = array => array.reduce((a, b) => a + b, 0);

        const average = array => sum(array) / array.length;

        const median = array => array.length % 2 === 0 ?
            (array[array.length / 2 - 1] + array[array.length / 2]) / 2 :
            array[Math.ceil(array.length / 2) - 1];

        const copyAndSort = array => array.slice().sort(compareNumbers);

        {
            const isPositive = n => n >= 0;

            for (let i = 0; i < orienteeringData.numberOfControls + 1; i++) {

                const relativeLegTimeInSecondsSortedAscending = results.map(athlete => athlete.leg.relativeTimesInSeconds[i])
                    .filter(isPositive)
                    .sort(compareNumbers);

                orienteeringData.secondBest.leg.relativeTimesInSeconds[i] = relativeLegTimeInSecondsSortedAscending;

                const relativeSplitTimeInSecondsSortedAscending = results.map(athlete => athlete.split.relativeTimesInSeconds[i])
                    .filter(isPositive)
                    .sort(compareNumbers);

                orienteeringData.secondBest.split.relativeTimesInSeconds[i] = relativeSplitTimeInSecondsSortedAscending;
            }
        }

        {
            // Calculate additional information.
            results.forEach(athlete => {
                athlete.controls.forEach((control, index) => {

                    const bestLegTimeInSeconds = orienteeringData.best.leg.timesInSeconds[index];
                    const bestSplitTimeInSeconds = orienteeringData.best.split.timesInSeconds[index];
                    const relativeLegTimeInSecondsSortedAscending = orienteeringData.secondBest.leg.relativeTimesInSeconds[index][1];
                    const relativeSplitTimeInSecondsSortedAscending = orienteeringData.secondBest.split.relativeTimesInSeconds[index][1];

                    const legTimeInSeconds = control.leg.relativeTimeInSeconds !== MISSING_TIME ? bestLegTimeInSeconds + control.leg.relativeTimeInSeconds : MISSING_TIME;
                    const splitTimeInSeconds = control.split.relativeTimeInSeconds !== MISSING_TIME ? bestSplitTimeInSeconds + control.split.relativeTimeInSeconds : MISSING_TIME;

                    control.leg.actualTimeMinimized = formatTime(legTimeInSeconds, 'minutes');
                    control.split.actualTimeMinimized = formatTime(splitTimeInSeconds, 'minutes');

                    const relativeLegTimeMinimized =
                        control.leg.relativeTimeInSeconds > 0 ?
                            '+' + formatTime(control.leg.relativeTimeInSeconds) :
                            control.leg.relativeTimeInSeconds === 0 ?
                                relativeLegTimeInSecondsSortedAscending > 0 ?
                                    '-' + formatTime(relativeLegTimeInSecondsSortedAscending) :
                                    0 :
                                null;
                    athlete.leg.relativeTimesMinimized.push(relativeLegTimeMinimized);
                    control.leg.relativeTimeMinimized = relativeLegTimeMinimized;

                    const relativeSplitTimeMinimized =
                        control.split.relativeTimeInSeconds > 0 ?
                            '+' + formatTime(control.split.relativeTimeInSeconds) :
                            control.split.relativeTimeInSeconds === 0 ?
                                relativeSplitTimeInSecondsSortedAscending > 0 ?
                                    '-' + formatTime(relativeSplitTimeInSecondsSortedAscending) :
                                    0 :
                                null;
                    athlete.split.relativeTimesMinimized.push(relativeSplitTimeMinimized);
                    control.split.relativeTimeMinimized = relativeSplitTimeMinimized;
                });

                // // Add 'Start' times for every athlete. NOT NEEDED!!!!
                // athlete.leg.relativeTimesInSeconds.unshift(0);
                // athlete.split.relativeTimesInSeconds.unshift(0);
            });
        }

        aggregated.names = results
            .map(athlete => athlete.name);

        const isMinorMistake = isMistake(orienteeringData.best.leg.timesInSeconds, 15);
        const isMajorMistake = isMistake(orienteeringData.best.leg.timesInSeconds, 30);

        // Enhancing results for each athlete.
        results.forEach(athlete => {

            athlete.additionals = {};

            athlete.additionals.legFirstPlace = athlete.leg.places
                .filter(legPlace => legPlace === 1)
                .length;

            athlete.additionals.legSecondPlace = athlete.leg.places
                .filter(legPlace => legPlace === 2)
                .length;

            athlete.additionals.legThirdPlace = athlete.leg.places
                .filter(legPlace => legPlace === 3)
                .length;

            athlete.additionals.leg4_6Place = athlete.leg.places
                .filter(legPlace => legPlace >= 4 && legPlace <= 6)
                .length;

            athlete.additionals.leg7_12Place = athlete.leg.places
                .filter(legPlace => legPlace >= 7 && legPlace <= 12)
                .length;

            athlete.additionals.legNoMistake = athlete.leg.relativeTimesInSeconds
                .filter((relativeLegTime, index) => !isMinorMistake(relativeLegTime, index) && !isMajorMistake(relativeLegTime, index))
                .length;

            athlete.additionals.legMinorMistake = athlete.leg.relativeTimesInSeconds
                .filter((relativeLegTime, index) => isMinorMistake(relativeLegTime, index) && !isMajorMistake(relativeLegTime, index))
                .length;

            athlete.additionals.legMajorMistake = athlete.leg.relativeTimesInSeconds
                .filter((relativeLegTime, index) => isMajorMistake(relativeLegTime, index))
                .length;

            {
                athlete.additionals.legWithin1Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 0, 1)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin2Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 1, 2)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin4Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 2, 4)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin8Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 4, 8)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin16Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 8, 16)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin32Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 16, 32)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin64Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 32, 64)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin128Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 64, 128)(relativeLegTime, index))
                    .length;

                athlete.additionals.legAbove128Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isAbovePercentage(orienteeringData.best.leg.timesInSeconds, 128)(relativeLegTime, index))
                    .length;
            }

            {
                athlete.split.times = athlete.split.relativeTimes
                    .map((relativeSplitTime, index) => {

                        const relativeSplitTimeInSeconds = athlete.split.relativeTimesInSeconds[index];

                        const splitTimeInSecondsForAthlete =
                            orienteeringData.best.split.timesInSeconds[index] +
                            relativeSplitTimeInSeconds;

                        const splitTimeStringForAthlete = relativeSplitTimeInSeconds >= 0 ?
                            formatTime(splitTimeInSecondsForAthlete, 'hours', true) :
                            null;

                        return {
                            t: splitTimeStringForAthlete,
                            y: index < orienteeringData.numberOfControls ? 'Control ' + (index + 1) : 'Finish'
                            // y: (index + 1)
                        }
                    });
            }

            {
                athlete.leg.timesPercentages = athlete.leg.relativeTimesInSeconds
                    .map((relativeLegTimeInSeconds, index) => {

                        return calculateMistakeInPercentage(orienteeringData.best.leg.timesInSeconds)(relativeLegTimeInSeconds, index);
                    });
            }

            {
                athlete.split.timesPercentages = athlete.split.relativeTimesInSeconds
                    .map((relativeSplitTimeInSeconds, index) => {

                        return calculateMistakeInPercentage(orienteeringData.best.split.timesInSeconds)(relativeSplitTimeInSeconds, index);
                    });
            }

            {
                // Calculate average and median for mistakes.

                const timesPercentagesSortedAscending = copyAndSort(athlete.leg.timesPercentages);

                athlete.leg.averagePercentageLoss = roundToOneDecimal(average(timesPercentagesSortedAscending));

                athlete.leg.medianPercentageLoss = median(timesPercentagesSortedAscending);
            }
        });

        aggregated.place.legFirstPlaces = results
            .map(athlete => athlete.additionals.legFirstPlace);

        aggregated.place.legSecondPlaces = results
            .map(athlete => athlete.additionals.legSecondPlace);

        aggregated.place.legThirdPlaces = results
            .map(athlete => athlete.additionals.legThirdPlace);

        aggregated.place.leg4_6Places = results
            .map(athlete => athlete.additionals.leg4_6Place);

        aggregated.place.leg7_12Places = results
            .map(athlete => athlete.additionals.leg7_12Place);

        aggregated.mistake.legNoMistakes = results
            .map(athlete => athlete.additionals.legNoMistake);

        aggregated.mistake.legMinorMistakes = results
            .map(athlete => athlete.additionals.legMinorMistake);

        aggregated.mistake.legMajorMistakes = results
            .map(athlete => athlete.additionals.legMajorMistake);

        {
            aggregated.mistake.legWithin1Percent = results
                .map(athlete => athlete.additionals.legWithin1Percent);

            aggregated.mistake.legWithin2Percent = results
                .map(athlete => athlete.additionals.legWithin2Percent);

            aggregated.mistake.legWithin4Percent = results
                .map(athlete => athlete.additionals.legWithin4Percent);

            aggregated.mistake.legWithin8Percent = results
                .map(athlete => athlete.additionals.legWithin8Percent);

            aggregated.mistake.legWithin16Percent = results
                .map(athlete => athlete.additionals.legWithin16Percent);

            aggregated.mistake.legWithin32Percent = results
                .map(athlete => athlete.additionals.legWithin32Percent);

            aggregated.mistake.legWithin64Percent = results
                .map(athlete => athlete.additionals.legWithin64Percent);

            aggregated.mistake.legWithin128Percent = results
                .map(athlete => athlete.additionals.legWithin128Percent);

            aggregated.mistake.legAbove128Percent = results
                .map(athlete => athlete.additionals.legAbove128Percent);
        }

        {
            aggregated.averagePercentageLoss = results
                .map(athlete => athlete.leg.averagePercentageLoss);

            aggregated.medianPercentageLoss = results
                .map(athlete => athlete.leg.medianPercentageLoss);
        }

        console.log('Enhancing data so it can be used together with charts - DONE');
    };

    console.log(`Initializing orienteering functionality - DONE (version ${version})`);

    return {
        version,
        parseSplitTimesExportedAsText,
        enhanceOrienteeringDataForCharts,
        formatTime: formatTime
    }

})();