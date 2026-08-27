const width = 800;
const height = 500;

const margin = {
    top: 40,
    right: 170,
    bottom: 70,
    left: 70
};

d3.csv("../data/students_multivariate.csv", d => ({
    name: d.name,
    study_hours: +d.study_hours,
    score: +d.score,
    major: d.major,
    year: d.year
}))
.then(data => {
    console.log(data);
});